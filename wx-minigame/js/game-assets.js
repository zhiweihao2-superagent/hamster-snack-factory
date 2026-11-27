/* Auto-generated WeChat WASubContext sandbox bridge — edit root game.js instead */
var __wxRoot = (typeof GameGlobal !== "undefined") ? GameGlobal : ((typeof globalThis !== "undefined") ? globalThis : this);
var window = __wxRoot.window || __wxRoot;
var self = __wxRoot.self || window;
var document = __wxRoot.document;
var navigator = __wxRoot.navigator;
var performance = __wxRoot.performance;
var localStorage = __wxRoot.__wxStorage;
try { if (!localStorage) localStorage = __wxRoot.localStorage; } catch (_e) {}
var Image = __wxRoot.Image;
var AudioContext = __wxRoot.AudioContext || window.AudioContext;
var webkitAudioContext = __wxRoot.webkitAudioContext || window.webkitAudioContext || AudioContext;
var HTMLCanvasElement = __wxRoot.HTMLCanvasElement;
var FinalizationRegistry = __wxRoot.FinalizationRegistry;
var CustomEvent = __wxRoot.CustomEvent;
var requestAnimationFrame = function (cb) { return (__wxRoot.requestAnimationFrame || window.requestAnimationFrame).call(window, cb); };
var cancelAnimationFrame = function (id) { return (__wxRoot.cancelAnimationFrame || window.cancelAnimationFrame).call(window, id); };

window.GAME = Object.assign(window.GAME || {}, {
  "title": "仓鼠零食工厂",
  "rules": {
    "boardSize": 5,
    "levels": [
      {
        "name": "工厂开张",
        "steps": 5,
        "target": 40,
        "hint": "swap",
        "tip": "滑动相邻的两颗零食，三个排成一线就能消除。"
      },
      {
        "name": "第一笔订单",
        "steps": 6,
        "target": 74,
        "hint": "cascade",
        "tip": "先消下面的，上面的零食掉下来还会继续消 —— 掉落连击不花步数。"
      },
      {
        "name": "零食试吃会",
        "steps": 6,
        "target": 82,
        "tip": ""
      },
      {
        "name": "挑食订单",
        "steps": 7,
        "target": 118,
        "want": 0,
        "need": 6,
        "hint": "order",
        "tip": "这关的订单要花生：只算真正消掉的花生，强化追加的通用进度不算。"
      },
      {
        "name": "零食节",
        "steps": 7,
        "target": 132,
        "tip": ""
      }
    ],
    "tools": [
      {
        "name": "打包机",
        "needsCell": true,
        "desc": "点它，再点盘上一格：那一整行和一整列都打掉"
      },
      {
        "name": "打包仓鼠",
        "needsCell": false,
        "desc": "点它：仓鼠啃掉最多那种零食的 10 格"
      },
      {
        "name": "大礼盒",
        "needsCell": true,
        "desc": "点它，再点盘上一格：那一片 5×5 全炸开"
      }
    ],
    "sound": true,
    "save": true,
    "autoplay": true,
    "rpg": {
      "hp": 100,
      "armorMax": 60,
      "partsMax": 26,
      "energyMax": 130,
      "yieldPer": {
        "energy": 4,
        "armor": 2,
        "parts": 1
      },
      "cascade": [
        1,
        1.5,
        2,
        3
      ],
      "turret": {
        "cost": 8,
        "dmg": 7
      },
      "ult": {
        "cost": 60,
        "dmg": 22
      },
      "slots": 5,
      "squad": [
        "tank-2",
        "shot-2"
      ],
      "tankRedirect": 0.2,
      "tankReduce": 0.3,
      "chapter": {
        "name": "工厂开张",
        "onField": 2,
        "tools": [
          1,
          1,
          1
        ],
        "waves": [
          [
            {
              "type": "crate"
            }
          ],
          [
            {
              "type": "crate"
            },
            {
              "type": "shell"
            }
          ],
          [
            {
              "type": "crate"
            },
            {
              "type": "thief"
            }
          ],
          [
            {
              "type": "shell"
            },
            {
              "type": "thief"
            }
          ],
          [
            {
              "type": "boss"
            },
            {
              "type": "crate"
            }
          ]
        ]
      },
      "foes": {
        "crate": {
          "name": "纸箱鼠",
          "hp": 34,
          "chargeMs": 4300,
          "atk": 13,
          "box": 1
        },
        "shell": {
          "name": "抛壳鼠",
          "hp": 42,
          "chargeMs": 4500,
          "atk": 14,
          "pierce": 1
        },
        "thief": {
          "name": "拾荒鼠",
          "hp": 26,
          "chargeMs": 7000,
          "atk": 0,
          "steal": 3
        },
        "boss": {
          "name": "质检机",
          "hp": 110,
          "chargeMs": 5600,
          "atk": 18,
          "boss": 1
        }
      },
      "roster": {
        "cannon": {
          "need": 6
        },
        "sniper": {
          "need": 9
        }
      },
      "realtime": true,
      "armorStepCap": 6,
      "graceMs": 8000,
      "pickEveryN": 2,
      "levels": [
        {
          "name": "工厂开张",
          "onField": 2,
          "tools": [
            1,
            1,
            1
          ],
          "mod": {
            "note": ""
          },
          "waves": [
            [
              {
                "type": "crate"
              }
            ],
            [
              {
                "type": "crate"
              },
              {
                "type": "shell"
              }
            ],
            [
              {
                "type": "crate"
              },
              {
                "type": "crate"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "crate"
              }
            ],
            [
              {
                "type": "boss"
              },
              {
                "type": "crate"
              }
            ]
          ],
          "enemyTier": 1,
          "brief": "",
          "tut": true
        },
        {
          "name": "订单加急",
          "onField": 3,
          "tools": [
            1,
            1,
            1
          ],
          "mod": {
            "chargeMul": 0.75,
            "hpMul": 0.9,
            "note": "加急单：敌人出手更快"
          },
          "waves": [
            [
              {
                "type": "crate"
              },
              {
                "type": "shell"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "shell"
              }
            ],
            [
              {
                "type": "thief"
              },
              {
                "type": "shell"
              },
              {
                "type": "crate"
              }
            ],
            [
              {
                "type": "boss"
              },
              {
                "type": "shell"
              },
              {
                "type": "thief"
              }
            ]
          ],
          "enemyTier": 1,
          "brief": "敌人出手加快"
        },
        {
          "name": "挑食订单",
          "onField": 3,
          "tools": [
            1,
            1,
            1
          ],
          "mod": {
            "yieldMul": {
              "parts": 0.4
            },
            "armorMaxDelta": -10,
            "note": "瓜子断供：零件产出腰斩"
          },
          "waves": [
            [
              {
                "type": "crate"
              },
              {
                "type": "crate"
              },
              {
                "type": "shell"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "thief"
              },
              {
                "type": "shell"
              }
            ],
            [
              {
                "type": "crate"
              },
              {
                "type": "thief"
              },
              {
                "type": "boss"
              }
            ],
            [
              {
                "type": "boss"
              },
              {
                "type": "shell"
              },
              {
                "type": "thief"
              }
            ]
          ],
          "enemyTier": 2,
          "brief": "瓜子断供"
        },
        {
          "name": "鼠海",
          "onField": 4,
          "tools": [
            1,
            1,
            1
          ],
          "mod": {
            "hpMul": 0.62,
            "atkMul": 0.85,
            "note": "鼠海：更多，但更脆"
          },
          "waves": [
            [
              {
                "type": "crate"
              },
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "thief"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "shell"
              },
              {
                "type": "crate"
              },
              {
                "type": "glue"
              }
            ],
            [
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "thief"
              },
              {
                "type": "crate"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "thief"
              },
              {
                "type": "crate"
              },
              {
                "type": "shell"
              }
            ],
            [
              {
                "type": "crate"
              },
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "thief"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "crate"
              },
              {
                "type": "boss"
              },
              {
                "type": "glue"
              }
            ]
          ],
          "enemyTier": 2,
          "brief": "敌人更多更脆"
        },
        {
          "name": "质检日",
          "onField": 4,
          "tools": [
            1,
            1,
            1
          ],
          "mod": {
            "atkMul": 1.15,
            "note": "质检日：第 2 波就来质检机（T3，血薄）",
            "hpMul": 1
          },
          "waves": [
            [
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "thief"
              }
            ],
            [
              {
                "type": "boss"
              },
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "glue"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "boss"
              },
              {
                "type": "thief"
              },
              {
                "type": "crate"
              }
            ],
            [
              {
                "type": "boss"
              },
              {
                "type": "shell"
              },
              {
                "type": "boss"
              },
              {
                "type": "glue"
              }
            ]
          ],
          "enemyTier": 3,
          "brief": "质检机提前登场"
        },
        {
          "name": "夜班",
          "onField": 4,
          "tools": [
            1,
            1,
            1
          ],
          "mod": {
            "noUlt": true,
            "yieldMul": {
              "energy": 0.8
            },
            "note": "停电：大招停用，能量略降（T2 但人多）",
            "hpMul": 1
          },
          "waves": [
            [
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "thief"
              },
              {
                "type": "glue"
              }
            ],
            [
              {
                "type": "thief"
              },
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "glue"
              }
            ],
            [
              {
                "type": "shell"
              },
              {
                "type": "shell"
              },
              {
                "type": "crate"
              },
              {
                "type": "thief"
              }
            ],
            [
              {
                "type": "boss"
              },
              {
                "type": "crate"
              },
              {
                "type": "shell"
              },
              {
                "type": "glue"
              }
            ]
          ],
          "enemyTier": 2,
          "brief": "工厂停电：大招停用"
        }
      ],
      "roundScale": 1.15,
      "compose": {
        "maxSameLine": 2
      },
      "catchUp": {
        "enable": true,
        "gap": 3
      },
      "foeScale": {
        "hp": 1,
        "atk": 1
      }
    },
    "artPixelScale": 2
  },
  "slots": {
    "hamster": {
      "tile": false,
      "custom": false
    },
    "snack_peanut": {
      "tile": false,
      "custom": false
    },
    "snack_cookie": {
      "tile": false,
      "custom": false
    },
    "snack_seed": {
      "tile": false,
      "custom": false
    }
  },
  "assets": {
    "hamster": "images/hamster.png",
    "snack_peanut": "images/snack_peanut.png",
    "snack_cookie": "images/snack_cookie.png",
    "snack_seed": "images/snack_seed.png"
  }
});
__wxRoot.GAME = window.GAME;
