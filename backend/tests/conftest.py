"""Test configuration: an isolated data dir + SQLite DB, no background model build, no scheduler."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="kuze-test-")
os.environ["KUZE_DATA_DIR"] = _tmp
os.environ["KUZE_DB_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["KUZE_WARMUP"] = "0"
os.environ["KUZE_SCHEDULER"] = "0"
os.environ["KUZE_USERS"] = "alice:pw-alice-123,bob:pw-bob-456"
os.environ["KUZE_JWT_SECRET"] = "test-secret-0123456789abcdef0123456789abcdef"
os.environ.pop("ODDS_API_KEY", None)
os.environ.pop("ANTHROPIC_API_KEY", None)
