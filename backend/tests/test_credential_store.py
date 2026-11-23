import json
import types
import unittest
from unittest.mock import patch

import keyring

from app.agent.chatgpt_auth import ChatGPTError, KeyringCredentialStore


class NativeStoreError(Exception):
    pass


class LimitedKeyring:
    errors = keyring.errors

    def __init__(self):
        self.values = {}
        self.writes = 0
        self.fail_write = None
        self.fail_delete = None

    def get_password(self, service, account):
        return self.values.get((service, account))

    def set_password(self, service, account, value):
        self.writes += 1
        if self.writes == self.fail_write or len(value.encode("utf-16-le")) > 2560:
            raise NativeStoreError("native failure: SECRET")
        self.values[service, account] = value

    def delete_password(self, service, account):
        if service == self.fail_delete:
            raise NativeStoreError("native failure: SECRET")
        if (service, account) not in self.values:
            raise keyring.errors.PasswordDeleteError("not found")
        del self.values[service, account]


class CredentialStoreTests(unittest.TestCase):
    def setUp(self):
        self.store = KeyringCredentialStore("test-account")
        self.keyring = LimitedKeyring()
        self.root = (self.store.service, self.store.account)
        self.addCleanup(patch.stopall)
        patch.object(self.store, "_keyring", return_value=self.keyring).start()
        patch("app.agent.chatgpt_auth.sys", types.SimpleNamespace(platform="win32")).start()
        self.value = {"access_token": "x" * 7000, "refresh_token": "y" * 3000,
                      "id_token": "z" * 5000, "name": "测试😀"}

    def test_large_credentials_round_trip_below_native_limit(self):
        self.store.write(self.value)
        self.assertEqual(self.store.read(), self.value)
        self.assertGreater(len(self.keyring.values), 2)
        for raw in self.keyring.values.values():
            self.assertLessEqual(len(raw.encode("utf-16-le")), 2560)

    def test_small_and_legacy_credentials_remain_readable(self):
        self.keyring.values[self.root] = json.dumps({"access_token": "legacy"})
        self.assertEqual(self.store.read(), {"access_token": "legacy"})
        self.store.write({"access_token": "small"})
        self.assertEqual(self.store.read(), {"access_token": "small"})
        self.assertEqual(len(self.keyring.values), 1)

    def test_failed_chunk_write_preserves_old_credentials_and_cleans_staging(self):
        self.store.write({"access_token": "old"})
        self.keyring.fail_write = self.keyring.writes + 3
        with self.assertRaises(ChatGPTError) as error:
            self.store.write(self.value)
        self.assertEqual(error.exception.code, "credential_storage_unavailable")
        self.assertNotIn("SECRET", str(error.exception))
        self.assertEqual(self.store.read(), {"access_token": "old"})
        self.assertEqual(len(self.keyring.values), 1)

    def test_failed_manifest_commit_preserves_old_chunk_generation(self):
        self.store.write(self.value)
        old = dict(self.keyring.values)
        changed = {"access_token": "new" * 2500}
        count = (len(json.dumps(changed)) + 999) // 1000
        self.keyring.fail_write = self.keyring.writes + count + 1
        with self.assertRaises(ChatGPTError):
            self.store.write(changed)
        self.assertEqual(self.keyring.values, old)
        self.assertEqual(self.store.read(), self.value)

    def test_refresh_removes_old_chunks_and_logout_removes_current_chunks(self):
        self.store.write(self.value)
        old_keys = set(self.keyring.values) - {self.root}
        self.store.write({"access_token": "new" * 2500})
        self.assertTrue(old_keys.isdisjoint(self.keyring.values))
        self.store.delete()
        self.assertIsNone(self.store.read())
        self.assertEqual(self.keyring.values, {})

    def test_replacing_chunked_credentials_with_small_value_cleans_chunks(self):
        self.store.write(self.value)
        self.store.write({"access_token": "small"})
        self.assertEqual(len(self.keyring.values), 1)
        self.assertEqual(self.store.read(), {"access_token": "small"})

    def test_missing_or_modified_chunk_fails_closed(self):
        for missing in [True, False]:
            with self.subTest(missing=missing):
                self.keyring.values.clear()
                self.store.write(self.value)
                key = next(key for key in self.keyring.values if key != self.root)
                if missing:
                    del self.keyring.values[key]
                else:
                    self.keyring.values[key] = "tampered"
                with self.assertRaises(ChatGPTError) as error:
                    self.store.read()
                self.assertEqual(error.exception.code, "credential_storage_corrupt")

    def test_invalid_manifest_is_rejected_and_can_be_removed(self):
        self.keyring.values[self.root] = json.dumps({"_clew_chunks": {"version": 1, "count": 100000}})
        with self.assertRaises(ChatGPTError):
            self.store.read()
        self.store.delete()
        self.assertEqual(self.keyring.values, {})

    def test_failed_chunk_deletion_keeps_manifest_for_retry(self):
        self.store.write(self.value)
        self.keyring.fail_delete = next(service for service, account in self.keyring.values if (service, account) != self.root)
        with self.assertRaises(ChatGPTError):
            self.store.delete()
        self.assertIn(self.root, self.keyring.values)
        self.keyring.fail_delete = None
        self.store.delete()
        self.assertEqual(self.keyring.values, {})

    def test_non_windows_keeps_existing_single_entry_storage(self):
        with patch("app.agent.chatgpt_auth.sys", types.SimpleNamespace(platform="linux")):
            self.store.write({"access_token": "x" * 1100})
        self.assertEqual(len(self.keyring.values), 1)
        self.assertNotIn("_clew_chunks", self.keyring.values[self.root])

    def test_native_read_error_becomes_safe_application_error(self):
        with patch.object(self.keyring, "get_password", side_effect=NativeStoreError("SECRET")):
            with self.assertRaises(ChatGPTError) as error:
                self.store.read()
        self.assertEqual(error.exception.code, "credential_storage_unavailable")
        self.assertNotIn("SECRET", str(error.exception))


if __name__ == "__main__":
    unittest.main()
