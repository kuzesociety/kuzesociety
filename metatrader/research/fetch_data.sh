#!/usr/bin/env bash
# Download the public datasets used by the validation into $KZ_RAW (default: research/data_raw).
# Nothing is stored in this repository: the files are large and each source has its own licence / terms (see docs/VALIDATION_REPORT.md).
#
#   ./fetch_data.sh            all sources (~1.5 GB)
#   ./fetch_data.sh nq cfd5    only the named ones:  xau nq fx15 btc cfd5
#
# Uses partial (blob-less) sparse clones, so only the listed files are transferred.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="${KZ_RAW:-$HERE/data_raw}"
mkdir -p "$RAW"

fetch() {  # fetch <local dir name> <https url> <sparse pattern>...
  local name="$1" url="$2"; shift 2
  local dir="$RAW/$name"
  if [ -d "$dir/.git" ]; then echo "[skip] $name already present"; return 0; fi
  echo "[get ] $name  <- $url"
  git clone --quiet --filter=blob:none --no-checkout --depth 1 "$url" "$dir"
  git -C "$dir" sparse-checkout set --no-cone "$@"
  git -C "$dir" checkout --quiet
}

get_xau()  { fetch Dypoi_XAUUSD_Dataset https://github.com/Dypoi/XAUUSD_Dataset.git '/XAUUSD_M1_*.csv'; }
get_nq()   { fetch getdata-finance_nq-1m-ohlcv-stocks-historical-data https://github.com/getdata-finance/nq-1m-ohlcv-stocks-historical-data.git '/NQ_1m.csv'; }
get_fx15() { fetch ejtraderLabs_historical-data https://github.com/ejtraderLabs/historical-data.git '/*/*m15.csv'; }
get_btc()  { fetch ff137_btc https://github.com/ff137/bitstamp-btcusd-minute-data.git \
               '/data/historical/btcusd_bitstamp_1min_2012-2025.csv.gz' '/data/updates/btcusd_bitstamp_1min_latest.csv'; }
get_cfd5() { fetch TheSnowGuru_Stocks-Futures-Financial-Time-series-Tick-Bar-Data \
               https://github.com/TheSnowGuru/Stocks-Futures-Financial-Time-series-Tick-Bar-Data.git \
               '/indices/nasdaq100/USATECHIDXUSD_M5.csv' '/indices/s&p500/USA500IDXUSD_M5.csv' '/indices/dow30/USA30IDXUSD_M5.csv' \
               '/indices/dax30/DEUIDXEUR_M5.csv' '/indices/ftse100/GBRIDXGBP_M5.csv' \
               '/commodities/gold/XAUUSD_M5.csv' '/forex/eurusd/EURUSD_M5.csv'; }

WHICH=("$@"); [ ${#WHICH[@]} -eq 0 ] && WHICH=(xau nq fx15 btc cfd5)
for w in "${WHICH[@]}"; do
  case "$w" in
    xau|nq|fx15|btc|cfd5) "get_$w" ;;
    *) echo "unknown source '$w' (xau nq fx15 btc cfd5)"; exit 2 ;;
  esac
done
echo "done. Next:  KZ_RAW=$RAW python3 py/datasets.py   (builds the normalised caches in \$KZ_DATA)"
