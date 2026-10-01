"""Shared research helpers: DST-aware clocks, data loaders, bar aggregation."""
import numpy as np, pandas as pd, datetime as _dt
import os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
RAW = os.environ.get('KZ_RAW', os.path.join(ROOT, 'data_raw'))      # raw public datasets (see fetch_data.sh)
DATA = os.environ.get('KZ_DATA', os.path.join(ROOT, 'data_cache'))  # normalised .npy caches (built by 01_build_caches.py)

def _nth_weekday(year, month, weekday, n):
    """n-th (1-based) weekday (Mon=0) of month; n=-1 => last."""
    if n>0:
        d=_dt.date(year,month,1)
        off=(weekday-d.weekday())%7
        return d+_dt.timedelta(days=off+7*(n-1))
    d=_dt.date(year+ (month==12), (month%12)+1, 1)-_dt.timedelta(days=1)
    off=(d.weekday()-weekday)%7
    return d-_dt.timedelta(days=off)

def _epoch(d, hour_utc):
    return int((_dt.datetime(d.year,d.month,d.day,hour_utc,tzinfo=_dt.timezone.utc)).timestamp())

def dst_table(region, y0=2010, y1=2030):
    """Return sorted array of UTC transition epochs [start0,end0,start1,end1,...] for DST periods."""
    out=[]
    for y in range(y0,y1+1):
        if region=='US':   # 2nd Sun Mar 07:00 UTC (02:00 EST) -> 1st Sun Nov 06:00 UTC (02:00 EDT)
            out += [_epoch(_nth_weekday(y,3,6,2),7), _epoch(_nth_weekday(y,11,6,1),6)]
        elif region=='EU': # last Sun Mar 01:00 UTC -> last Sun Oct 01:00 UTC
            out += [_epoch(_nth_weekday(y,3,6,-1),1), _epoch(_nth_weekday(y,10,6,-1),1)]
    return np.array(out,dtype=np.int64)

_US=dst_table('US'); _EU=dst_table('EU')

def is_dst(t, region):
    tab={'US':_US,'EU':_EU}[region]
    k=np.searchsorted(tab,t,side='right')
    return (k%2)==1

def clock_offset(t, clock):
    """Seconds to add to UTC epoch t to get local clock time. clock in NY, LON, FRA, TYO, UTC."""
    t=np.asarray(t)
    if clock=='NY':  return np.where(is_dst(t,'US'), -4*3600, -5*3600)
    if clock=='LON': return np.where(is_dst(t,'EU'),  1*3600,  0)
    if clock=='FRA': return np.where(is_dst(t,'EU'),  2*3600,  1*3600)
    if clock=='TYO': return np.full(t.shape, 9*3600)
    if clock=='UTC': return np.zeros(t.shape,dtype=np.int64)
    raise ValueError(clock)

def local_parts(t, clock):
    """(local_day_index, minute_of_day, weekday Mon=0) arrays for epoch seconds t."""
    lt=np.asarray(t)+clock_offset(t,clock)
    day=lt//86400
    mod=(lt%86400)//60
    wd=((day+3)%7)   # 1970-01-01 was Thursday(3)
    return day.astype(np.int64), mod.astype(np.int32), wd.astype(np.int32)

def load_cache(name):
    """Load a normalised cache: structured array t(utc s),o,h,l,c (bid),ao,ah,al,ac (ask),v."""
    return np.load(os.path.join(DATA, name + '.npy'))

def load_xau():
    return load_cache('xauusd_m1')

def agg_bars(t,o,h,l,c,v,sp_o,sp_c,minutes):
    """Aggregate M1 arrays into `minutes`-minute bars aligned to UTC epoch multiples.
    Returns dict of arrays plus first/last M1 index of each bar."""
    key=(t//(60*minutes))
    # boundaries where key changes
    chg=np.flatnonzero(np.diff(key))+1
    starts=np.concatenate(([0],chg)); ends=np.concatenate((chg,[len(t)]))
    n=len(starts)
    A=dict(t=key[starts]*60*minutes, o=o[starts], c=c[ends-1],
           h=np.maximum.reduceat(h,starts), l=np.minimum.reduceat(l,starts),
           v=np.add.reduceat(v,starts), sp=sp_o[starts], i0=starts, i1=ends-1)
    # bars must be complete: count of M1 bars in period (allow gaps)
    return A
