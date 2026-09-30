// Compiles the EA's own time code (KzTime.mqh) as C++ and prints derived values for timestamps read from stdin.
#include <cstdio>
#include "../../MQL5/Include/KuzeEdge/KzTypes.mqh"
#include "../../MQL5/Include/KuzeEdge/KzUtil.mqh"
#include "../../MQL5/Include/KuzeEdge/KzTime.mqh"
int main(){
  long long t;
  while(scanf("%lld",&t)==1){
    printf("%lld",t);
    for(int c=0;c<5;c++) printf(" %d %d %d",KzClockOffset(t,c),KzLocalMinute(t,c),KzLocalWeekday(t,c));
    printf(" %lld %d %d %lld %lld\n",(long long)KzSessionDay(t),(int)KzDstUS(t),(int)KzDstEU(t),
           (long long)KzServerToUtc(KzUtcToServer(t,KZ_SRV_NYCLOSE,0),KZ_SRV_NYCLOSE,0),(long long)KzNextFlat(t,16*60+50));
  }
  return 0;
}
