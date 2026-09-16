import { WeaponId } from './weapon-profiles'
export const WEAPON_ANIMATION_SOUNDS: Partial<Record<WeaponId, Record<string, { at: number; sound: string }[]>>> = {
  ak47: {
    reload: [
      {
        at: 0.35135135135135137,
        sound: 'ak47_clipout.wav'
      },
      {
        at: 1.5405405405405406,
        sound: 'ak47_clipin.wav'
      }
    ],
    draw: [
      {
        at: 0.36666666666666664,
        sound: 'ak47_boltpull.wav'
      }
    ]
  },
  aug: {
    reload: [
      {
        at: 0.25,
        sound: 'aug_boltpull.wav'
      },
      {
        at: 1.25,
        sound: 'aug_clipout.wav'
      },
      {
        at: 2.2,
        sound: 'aug_clipin.wav'
      },
      {
        at: 2.8,
        sound: 'aug_boltslap.wav'
      }
    ],
    draw: [
      {
        at: 0.2571428571428571,
        sound: 'aug_forearm.wav'
      }
    ]
  },
  awp: {
    shoot1: [
      {
        at: 0.42857142857142855,
        sound: 'boltup.wav'
      },
      {
        at: 0.5428571428571428,
        sound: 'boltpull1.wav'
      },
      {
        at: 0.9142857142857143,
        sound: 'boltdown.wav'
      }
    ],
    shoot2: [
      {
        at: 0.42857142857142855,
        sound: 'boltup.wav'
      },
      {
        at: 0.5428571428571428,
        sound: 'boltpull1.wav'
      },
      {
        at: 0.9142857142857143,
        sound: 'boltdown.wav'
      }
    ],
    shoot3: [
      {
        at: 0.42857142857142855,
        sound: 'boltup.wav'
      },
      {
        at: 0.5428571428571428,
        sound: 'boltpull1.wav'
      },
      {
        at: 0.9142857142857143,
        sound: 'boltdown.wav'
      }
    ],
    reload: [
      {
        at: 0.8666666666666667,
        sound: 'awp_clipout.wav'
      },
      {
        at: 1.7666666666666666,
        sound: 'awp_clipin.wav'
      }
    ]
  },
  deagle: {
    reload: [
      {
        at: 0.4666666666666667,
        sound: 'de_clipout.wav'
      },
      {
        at: 1.1333333333333333,
        sound: 'de_clipin.wav'
      }
    ],
    draw: [
      {
        at: 0.03333333333333333,
        sound: 'de_deploy.wav'
      }
    ]
  },
  elite: {
    reload: [
      {
        at: 0.2,
        sound: 'elite_reloadstart.wav'
      },
      {
        at: 1.4666666666666666,
        sound: 'elite_leftclipin.wav'
      },
      {
        at: 2.433333333333333,
        sound: 'elite_clipout.wav'
      },
      {
        at: 2.7333333333333334,
        sound: 'elite_sliderelease.wav'
      },
      {
        at: 3.7333333333333334,
        sound: 'elite_rightclipin.wav'
      },
      {
        at: 4.166666666666667,
        sound: 'elite_sliderelease.wav'
      }
    ],
    draw: [
      {
        at: 0.03333333333333333,
        sound: 'elite_deploy.wav'
      }
    ]
  },
  famas: {
    reload: [
      {
        at: 0.5,
        sound: 'famas_clipout.wav'
      },
      {
        at: 1.5666666666666667,
        sound: 'famas_clipin.wav'
      },
      {
        at: 2.1666666666666665,
        sound: 'famas_forearm.wav'
      }
    ],
    draw: [
      {
        at: 0.2857142857142857,
        sound: 'famas_forearm.wav'
      }
    ]
  },
  fiveseven: {
    reload: [
      {
        at: 0.5,
        sound: 'fiveseven_clipout.wav'
      },
      {
        at: 1.3666666666666667,
        sound: 'fiveseven_clipin.wav'
      },
      {
        at: 2.5,
        sound: 'fiveseven_sliderelease.wav'
      }
    ],
    draw: [
      {
        at: 0.43333333333333335,
        sound: 'fiveseven_slidepull.wav'
      }
    ]
  },
  g3sg1: {
    reload: [
      {
        at: 0.5333333333333333,
        sound: 'g3sg1_slide.wav'
      },
      {
        at: 1.8,
        sound: 'g3sg1_clipout.wav'
      },
      {
        at: 2.8333333333333335,
        sound: 'g3sg1_clipin.wav'
      },
      {
        at: 3.8666666666666667,
        sound: 'g3sg1_slide.wav'
      }
    ]
  },
  galil: {
    reload: [
      {
        at: 0.42857142857142855,
        sound: 'galil_clipout.wav'
      },
      {
        at: 1.3428571428571427,
        sound: 'galil_clipin.wav'
      },
      {
        at: 1.8571428571428572,
        sound: 'galil_boltpull.wav'
      }
    ],
    draw: [
      {
        at: 0.2857142857142857,
        sound: 'galil_boltpull.wav'
      }
    ]
  },
  glock18: {
    reload: [
      {
        at: 0.45714285714285713,
        sound: 'clipout1.wav'
      },
      {
        at: 1.3714285714285714,
        sound: 'clipin1.wav'
      },
      {
        at: 1.7714285714285714,
        sound: 'sliderelease1.wav'
      }
    ],
    draw: [
      {
        at: 0.37777777777777777,
        sound: 'slideback1.wav'
      }
    ],
    draw2: [
      {
        at: 0.4888888888888889,
        sound: 'slideback1.wav'
      }
    ],
    reload2: [
      {
        at: 0.36666666666666664,
        sound: 'clipout1.wav'
      },
      {
        at: 1.0666666666666667,
        sound: 'clipin1.wav'
      },
      {
        at: 1.4333333333333333,
        sound: 'sliderelease1.wav'
      }
    ]
  },
  knife: {},
  m249: {
    reload: [
      {
        at: 0.8333333333333334,
        sound: 'm249_coverup.wav'
      },
      {
        at: 1.5333333333333334,
        sound: 'm249_boxout.wav'
      },
      {
        at: 2.2333333333333334,
        sound: 'm249_boxin.wav'
      },
      {
        at: 2.9,
        sound: 'm249_chain.wav'
      },
      {
        at: 3.566666666666667,
        sound: 'm249_coverdown.wav'
      }
    ],
    draw: [
      {
        at: 0.7,
        sound: 'slideback1.wav'
      }
    ]
  },
  m3: {
    insert: [
      {
        at: 0.0,
        sound: 'm3_insertshell.wav'
      }
    ],
    after_reload: [
      {
        at: 0.0,
        sound: 'm3_pump.wav'
      }
    ],
    draw: [
      {
        at: 0.36666666666666664,
        sound: 'm3_pump.wav'
      }
    ]
  },
  m4a1: {
    reload: [
      {
        at: 0.6756756756756757,
        sound: 'm4a1_clipout.wav'
      },
      {
        at: 1.4324324324324325,
        sound: 'm4a1_clipin.wav'
      },
      {
        at: 2.3783783783783785,
        sound: 'm4a1_boltpull.wav'
      }
    ],
    draw: [
      {
        at: 0.025,
        sound: 'm4a1_deploy.wav'
      },
      {
        at: 0.425,
        sound: 'm4a1_boltpull.wav'
      }
    ],
    add_silencer: [
      {
        at: 0.9333333333333333,
        sound: 'm4a1_silencer_on.wav'
      }
    ],
    reload_unsil: [
      {
        at: 0.6756756756756757,
        sound: 'm4a1_clipout.wav'
      },
      {
        at: 1.4324324324324325,
        sound: 'm4a1_clipin.wav'
      },
      {
        at: 2.3783783783783785,
        sound: 'm4a1_boltpull.wav'
      }
    ],
    draw_unsil: [
      {
        at: 0.025,
        sound: 'm4a1_deploy.wav'
      },
      {
        at: 0.425,
        sound: 'm4a1_boltpull.wav'
      }
    ],
    detach_silencer: [
      {
        at: 0.7,
        sound: 'm4a1_silencer_off.wav'
      }
    ]
  },
  mac10: {
    reload: [
      {
        at: 0.6285714285714286,
        sound: 'mac10_clipout.wav'
      },
      {
        at: 1.5714285714285714,
        sound: 'mac10_clipin.wav'
      },
      {
        at: 2.4857142857142858,
        sound: 'mac10_boltpull.wav'
      }
    ]
  },
  mp5: {
    reload: [
      {
        at: 0.39473684210526316,
        sound: 'mp5_clipout.wav'
      },
      {
        at: 1.2105263157894737,
        sound: 'mp5_clipin.wav'
      },
      {
        at: 2.026315789473684,
        sound: 'mp5_slideback.wav'
      }
    ],
    draw: [
      {
        at: 0.37142857142857144,
        sound: 'mp5_slideback.wav'
      }
    ]
  },
  p228: {
    reload: [
      {
        at: 0.6857142857142857,
        sound: 'p228_clipout.wav'
      },
      {
        at: 1.4,
        sound: 'p228_clipin.wav'
      },
      {
        at: 2.3142857142857145,
        sound: 'p228_sliderelease.wav'
      }
    ],
    draw: [
      {
        at: 0.03333333333333333,
        sound: 'de_deploy.wav'
      },
      {
        at: 0.5,
        sound: 'p228_slidepull.wav'
      }
    ]
  },
  p90: {
    reload: [
      {
        at: 0.425,
        sound: 'p90_cliprelease.wav'
      },
      {
        at: 0.875,
        sound: 'p90_clipout.wav'
      },
      {
        at: 1.875,
        sound: 'p90_clipin.wav'
      },
      {
        at: 2.7,
        sound: 'p90_boltpull.wav'
      }
    ],
    draw: [
      {
        at: 0.3,
        sound: 'p90_boltpull.wav'
      }
    ]
  },
  scout: {
    shoot_1: [
      {
        at: 0.37142857142857144,
        sound: 'scout_bolt.wav'
      }
    ],
    shoot_2: [
      {
        at: 0.37142857142857144,
        sound: 'scout_bolt.wav'
      }
    ],
    reload: [
      {
        at: 0.43333333333333335,
        sound: 'scout_clipout.wav'
      },
      {
        at: 1.2333333333333334,
        sound: 'scout_clipin.wav'
      }
    ]
  },
  sg550: {
    reload: [
      {
        at: 0.7857142857142857,
        sound: 'sg550_clipout.wav'
      },
      {
        at: 1.6428571428571428,
        sound: 'sg550_clipin.wav'
      },
      {
        at: 2.9285714285714284,
        sound: 'sg550_boltpull.wav'
      }
    ]
  },
  sg552: {
    reload: [
      {
        at: 0.43243243243243246,
        sound: 'sg552_clipout.wav'
      },
      {
        at: 1.6486486486486487,
        sound: 'sg552_clipin.wav'
      },
      {
        at: 2.4324324324324325,
        sound: 'sg552_boltpull.wav'
      }
    ],
    draw: [
      {
        at: 0.32432432432432434,
        sound: 'sg552_boltpull.wav'
      }
    ]
  },
  tmp: {
    reload: [
      {
        at: 0.48,
        sound: 'clipout1.wav'
      },
      {
        at: 1.28,
        sound: 'clipin1.wav'
      }
    ]
  },
  ump45: {
    reload: [
      {
        at: 0.696969696969697,
        sound: 'ump45_clipout.wav'
      },
      {
        at: 1.7878787878787878,
        sound: 'ump45_clipin.wav'
      },
      {
        at: 2.606060606060606,
        sound: 'ump45_boltslap.wav'
      }
    ]
  },
  usp: {
    reload: [
      {
        at: 0.4594594594594595,
        sound: 'usp_clipout.wav'
      },
      {
        at: 1.0810810810810811,
        sound: 'usp_clipin.wav'
      },
      {
        at: 2.2162162162162162,
        sound: 'usp_sliderelease.wav'
      }
    ],
    draw: [
      {
        at: 0.020833333333333332,
        sound: 'de_deploy.wav'
      },
      {
        at: 0.5416666666666666,
        sound: 'usp_slideback.wav'
      }
    ],
    add_silencer: [
      {
        at: 1.027027027027027,
        sound: 'usp_silencer_on.wav'
      }
    ],
    reload_unsil: [
      {
        at: 0.4594594594594595,
        sound: 'usp_clipout.wav'
      },
      {
        at: 1.0810810810810811,
        sound: 'usp_clipin.wav'
      },
      {
        at: 2.2162162162162162,
        sound: 'usp_sliderelease.wav'
      }
    ],
    draw_unsil: [
      {
        at: 0.020833333333333332,
        sound: 'de_deploy.wav'
      },
      {
        at: 0.5416666666666666,
        sound: 'usp_slideback.wav'
      }
    ],
    detach_silencer: [
      {
        at: 0.7837837837837838,
        sound: 'usp_silencer_off.wav'
      }
    ]
  },
  xm1014: {
    draw: [
      {
        at: 0.03333333333333333,
        sound: 'de_deploy.wav'
      }
    ]
  },
  hegrenade: {
    pullpin: [
      {
        at: 0.6585365853658537,
        sound: 'pinpull.wav'
      }
    ]
  },
  flashbang: {
    pullpin: [
      {
        at: 0.6585365853658537,
        sound: 'pinpull.wav'
      }
    ]
  },
  smokegrenade: {
    pullpin: [
      {
        at: 0.6585365853658537,
        sound: 'pinpull.wav'
      }
    ]
  }
}
