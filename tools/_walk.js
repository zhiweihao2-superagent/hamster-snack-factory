function walkTick(dtMs){
  var step = STAGE.speed * dtMs / 1000;
  function move(o, isFoe, idx){
    if (!o || !o.alive) return;
    ensurePos(o, idx, isFoe);
    if (o.range === 'far') return;                  /* 远程守在主阵地，不追 */
    var t = targetOf(o, isFoe);
    if (!t){                                        /* 场上没敌人就往前压一点，别站着发呆 */
      o.x = clamp(o.x + (isFoe ? -step : step) * 0.6, 10, W - 10);
      return;
    }
    var need = STAGE2.reach * (o.range === 'mid' ? 1.5 : 1.15);
    var d = unitX(t) - unitX(o);
    if (Math.abs(d) <= need) return;                /* 已经够得着：站住打，不追着跑 */
    o.x = clamp(o.x + (d > 0 ? step : -step), 10, W - 10);
  }
  for (var i = 0; i < R.units.length; i++) move(R.units[i], false, i);
  for (var j = 0; j < R.enemies.length; j++) move(R.enemies[j], true, j);
}
