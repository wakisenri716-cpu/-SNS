// 長野県の全77市町村（未参加の掲載ページ用）と、それぞれの主な観光地.
//
// 市町村名・よみ・役所/役場の位置・公式サイト・キャッチフレーズ・地方公共団体
// コード: code4fukui/localgovjp（CC0）https://github.com/code4fukui/localgovjp
// 観光地のうち山・湖・峠・高原の位置: 国土地理院「地名集日本（GAZETTEER OF
// JAPAN）」を編集して作成（sorami/gazetter-of-japan 経由。緯度経度は1分単位
// ＝約1.5km の精度）https://www.gsi.go.jp/kihonjohochousa/gazetteer.html
// それ以外の観光地: ジャジバが一般に知られた情報から作成。位置は持たせず、
// Google Maps の設定時に名前から調べます（lib/locateTourismSpot.ts）。
//
// Assembled from those sources; correct an entry by editing it here.

export interface ListingSpot {
  name: string;
  description: string;
  lat?: number;
  lng?: number;
}

export interface ListingMunicipality {
  lgCode: string;
  name: string;
  kana: string;
  /** City hall / town or village office. */
  lat: number;
  lng: number;
  url: string;
  catchphrase: string;
  spots: ListingSpot[];
}

export const NAGANO_MUNICIPALITIES: ListingMunicipality[] = [
  {
    "lgCode": "202011",
    "name": "長野市",
    "kana": "ながのし",
    "lat": 36.64861111,
    "lng": 138.1944444,
    "url": "https://www.city.nagano.nagano.jp/",
    "catchphrase": "～善光寺平に結ばれる～ 人と地域がきらめくまち“ながの”",
    "spots": [
      {
        "name": "善光寺",
        "description": "宗派を問わず参拝できる寺院。「一生に一度は善光寺詣り」と言われ、本堂は国宝です。"
      },
      {
        "name": "戸隠神社",
        "description": "奥社・中社・宝光社などからなる神社。奥社参道の杉並木で知られます。"
      },
      {
        "name": "松代城跡",
        "description": "真田家が治めた城下町・松代にある城跡です。"
      },
      {
        "name": "川中島古戦場史跡公園",
        "description": "武田信玄と上杉謙信が戦った川中島の戦いの古戦場跡にある公園です。"
      }
    ]
  },
  {
    "lgCode": "202029",
    "name": "松本市",
    "kana": "まつもとし",
    "lat": 36.23805556,
    "lng": 137.9719444,
    "url": "https://www.city.matsumoto.nagano.jp/",
    "catchphrase": "健康寿命延伸都市・松本",
    "spots": [
      {
        "name": "旧開智学校",
        "description": "明治初期に建てられた擬洋風建築の校舎で、国宝に指定されています。"
      },
      {
        "name": "乗鞍高原",
        "description": "乗鞍岳のふもとに広がる高原。滝や池めぐり、夏の登山、冬のスキーが楽しめます。"
      },
      {
        "name": "白骨温泉",
        "description": "山あいにある乳白色の湯で知られる温泉地です。"
      },
      {
        "name": "美ヶ原高原（王ヶ頭）",
        "description": "標高約2,000mに広がる高原。最高地点の王ヶ頭からは北アルプスなどを見渡せます。",
        "lat": 36.233,
        "lng": 138.1
      },
      {
        "name": "穂高岳",
        "description": "上高地から見上げる北アルプスの山々。登山の名所として知られます。",
        "lat": 36.283,
        "lng": 137.65
      },
      {
        "name": "乗鞍岳",
        "description": "北アルプス南部の山。長野・岐阜の県境にそびえます。",
        "lat": 36.1,
        "lng": 137.55
      }
    ]
  },
  {
    "lgCode": "202037",
    "name": "上田市",
    "kana": "うえだし",
    "lat": 36.40194444,
    "lng": 138.2491667,
    "url": "https://www.city.ueda.nagano.jp/",
    "catchphrase": "日本のまん中 人がまん中 生活快適都市 ～水跳ね 緑かがやき 空 こころ 晴れわたるまち～",
    "spots": [
      {
        "name": "上田城跡公園",
        "description": "真田昌幸が築いた上田城の跡。櫓や石垣が残り、桜の名所でもあります。"
      },
      {
        "name": "別所温泉",
        "description": "「信州の鎌倉」とも呼ばれる、古い寺社が点在する温泉地です。"
      },
      {
        "name": "安楽寺 八角三重塔",
        "description": "別所温泉にある安楽寺の三重塔で、国宝に指定されています。"
      },
      {
        "name": "菅平高原",
        "description": "ラグビーなどのスポーツ合宿やスキーで知られる高原です。",
        "lat": 36.533,
        "lng": 138.333
      }
    ]
  },
  {
    "lgCode": "202045",
    "name": "岡谷市",
    "kana": "おかやし",
    "lat": 36.06694444,
    "lng": 138.0494444,
    "url": "https://www.city.okaya.lg.jp/",
    "catchphrase": "みんなが元気に輝く　たくましいまち岡谷",
    "spots": [
      {
        "name": "岡谷蚕糸博物館",
        "description": "製糸業で栄えた岡谷の歴史を伝える博物館です。"
      }
    ]
  },
  {
    "lgCode": "202053",
    "name": "飯田市",
    "kana": "いいだし",
    "lat": 35.51472222,
    "lng": 137.8219444,
    "url": "https://www.city.iida.lg.jp/",
    "catchphrase": "文化経済自立都市　美しい自然に恵まれ、長い歴史と尊い伝統文化につつまれた人情豊かなまち",
    "spots": [
      {
        "name": "天竜峡",
        "description": "天竜川が削った渓谷で、国の名勝に指定されています。"
      },
      {
        "name": "下栗の里",
        "description": "南アルプスを望む山の斜面に家や畑が点在する集落です。"
      }
    ]
  },
  {
    "lgCode": "202061",
    "name": "諏訪市",
    "kana": "すわし",
    "lat": 36.03916667,
    "lng": 138.1141667,
    "url": "https://www.city.suwa.lg.jp/www/index.jsp",
    "catchphrase": "ゆたかな自然と社会が調和する、心豊かな、活力のある環境文化都市",
    "spots": [
      {
        "name": "諏訪湖",
        "description": "長野県でいちばん大きな湖。湖畔の散策や夏の花火大会で知られます。",
        "lat": 36.05,
        "lng": 138.083
      },
      {
        "name": "諏訪大社 上社本宮",
        "description": "全国にある諏訪神社の総本社・諏訪大社の四つのお宮のひとつです。"
      },
      {
        "name": "高島城",
        "description": "諏訪湖のほとりに建つ城で、かつては「諏訪の浮城」と呼ばれました。"
      },
      {
        "name": "上諏訪温泉",
        "description": "諏訪湖の東岸に広がる温泉地です。"
      }
    ]
  },
  {
    "lgCode": "202070",
    "name": "須坂市",
    "kana": "すざかし",
    "lat": 36.65111111,
    "lng": 138.3069444,
    "url": "https://www.city.suzaka.nagano.jp/",
    "catchphrase": "いきいきすざか　やさしさと活力あふれる美しい共生・文化のまち",
    "spots": [
      {
        "name": "臥竜公園",
        "description": "池を囲むように桜が咲く、桜の名所として知られる公園です。"
      },
      {
        "name": "米子大瀑布",
        "description": "不動滝と権現滝の二つの大きな滝。日本の滝百選に選ばれています。"
      },
      {
        "name": "須坂の蔵の町並み",
        "description": "製糸業で栄えた時代の土蔵造りの建物が残る町並みです。"
      }
    ]
  },
  {
    "lgCode": "202088",
    "name": "小諸市",
    "kana": "こもろし",
    "lat": 36.32694444,
    "lng": 138.4261111,
    "url": "https://www.city.komoro.lg.jp/",
    "catchphrase": "みんなで育む　笑顔と自然が響きあうまち　小諸",
    "spots": [
      {
        "name": "懐古園",
        "description": "小諸城の跡にある公園。島崎藤村ゆかりの地としても知られます。"
      },
      {
        "name": "高峰高原",
        "description": "浅間山の西にある標高約2,000mの高原。星空や高山植物を楽しめます。"
      },
      {
        "name": "浅間山",
        "description": "長野・群馬の県境にそびえる活火山。登山の際は火山情報を確認してください。",
        "lat": 36.4,
        "lng": 138.517
      }
    ]
  },
  {
    "lgCode": "202096",
    "name": "伊那市",
    "kana": "いなし",
    "lat": 35.8275,
    "lng": 137.9538889,
    "url": "https://www.inacity.jp/",
    "catchphrase": "二つのアルプスに抱かれた自然共生都市　～人と歴史と文化を育む活力と交流の美しいまち～",
    "spots": [
      {
        "name": "高遠城址公園",
        "description": "タカトオコヒガンザクラが咲く桜の名所。「天下第一の桜」と称されます。"
      },
      {
        "name": "仙丈ヶ岳",
        "description": "南アルプスの山。「南アルプスの女王」とも呼ばれます。",
        "lat": 35.717,
        "lng": 138.183
      }
    ]
  },
  {
    "lgCode": "202100",
    "name": "駒ヶ根市",
    "kana": "こまがねし",
    "lat": 35.72888889,
    "lng": 137.9338889,
    "url": "https://www.city.komagane.nagano.jp/",
    "catchphrase": "アルプスがふたつ映えるまち　人と自然にやさしい はつらつとした文化公園都市",
    "spots": [
      {
        "name": "千畳敷カール",
        "description": "駒ヶ岳ロープウェイで行ける、氷河が削ってできた地形。高山植物が咲きます。"
      },
      {
        "name": "光前寺",
        "description": "しだれ桜やヒカリゴケで知られる古い寺院です。"
      },
      {
        "name": "早太郎温泉",
        "description": "中央アルプスのふもとにある温泉地です。"
      }
    ]
  },
  {
    "lgCode": "202118",
    "name": "中野市",
    "kana": "なかのし",
    "lat": 36.74194444,
    "lng": 138.3694444,
    "url": "https://www.city.nakano.nagano.jp/",
    "catchphrase": "緑豊かなふるさと　文化が香る元気なまち",
    "spots": [
      {
        "name": "中山晋平記念館",
        "description": "「シャボン玉」などの童謡で知られる作曲家・中山晋平の記念館です。"
      },
      {
        "name": "高社山",
        "description": "北信地方の山。「高井富士」とも呼ばれます。",
        "lat": 36.8,
        "lng": 138.4
      }
    ]
  },
  {
    "lgCode": "202126",
    "name": "大町市",
    "kana": "おおまちし",
    "lat": 36.50305556,
    "lng": 137.8508333,
    "url": "https://www.city.omachi.nagano.jp/",
    "catchphrase": "豊かな自然と文化の風　きらり輝くおおまち",
    "spots": [
      {
        "name": "扇沢",
        "description": "立山黒部アルペンルートの長野県側の玄関口です。"
      },
      {
        "name": "仁科三湖",
        "description": "木崎湖・中綱湖・青木湖の三つの湖の総称です。"
      },
      {
        "name": "大町温泉郷",
        "description": "北アルプスのふもとにある温泉地です。"
      },
      {
        "name": "鹿島槍ヶ岳",
        "description": "北アルプス後立山連峰の山。双耳峰の姿で知られます。",
        "lat": 36.633,
        "lng": 137.75
      },
      {
        "name": "針ノ木岳",
        "description": "北アルプスの山で、雪渓の登山道で知られます。",
        "lat": 36.533,
        "lng": 137.683
      }
    ]
  },
  {
    "lgCode": "202134",
    "name": "飯山市",
    "kana": "いいやまし",
    "lat": 36.85166667,
    "lng": 138.3655556,
    "url": "https://www.city.iiyama.nagano.jp/",
    "catchphrase": "雪と寺の町　飯山",
    "spots": [
      {
        "name": "斑尾高原",
        "description": "斑尾山のふもとに広がる高原リゾートです。",
        "lat": 36.833,
        "lng": 138.267
      },
      {
        "name": "戸狩温泉スキー場",
        "description": "温泉地にあるスキー場です。"
      },
      {
        "name": "飯山の寺町",
        "description": "多くの寺が並び、「雪国の小京都」とも呼ばれる町並みです。"
      }
    ]
  },
  {
    "lgCode": "202142",
    "name": "茅野市",
    "kana": "ちのし",
    "lat": 35.99555556,
    "lng": 138.1588889,
    "url": "https://www.city.chino.lg.jp/",
    "catchphrase": "～途切れることのない、人と歴史と自然の絆～　人も自然も元気で豊か　躍動する高原都市",
    "spots": [
      {
        "name": "尖石縄文考古館",
        "description": "国宝の土偶「縄文のビーナス」「仮面の女神」を収蔵する考古館です。"
      },
      {
        "name": "御射鹿池",
        "description": "森に囲まれた静かな池。水面に木々が映り込む景色で知られます。"
      },
      {
        "name": "蓼科高原",
        "description": "八ヶ岳連峰の北側に広がる高原リゾートです。"
      },
      {
        "name": "諏訪大社 上社前宮",
        "description": "諏訪大社の四つのお宮のひとつです。"
      },
      {
        "name": "車山高原",
        "description": "霧ヶ峰の最高峰・車山の高原。夏にはニッコウキスゲが咲きます。",
        "lat": 36.1,
        "lng": 138.2
      },
      {
        "name": "赤岳（八ヶ岳）",
        "description": "八ヶ岳連峰の最高峰です。",
        "lat": 35.967,
        "lng": 138.367
      }
    ]
  },
  {
    "lgCode": "202151",
    "name": "塩尻市",
    "kana": "しおじりし",
    "lat": 36.115,
    "lng": 137.9536111,
    "url": "https://www.city.shiojiri.lg.jp/",
    "catchphrase": "いきいき満彩 信州しおじり　ともに築く 自立と創造の田園都市",
    "spots": [
      {
        "name": "奈良井宿",
        "description": "中山道の宿場町。重要伝統的建造物群保存地区に選ばれています。"
      },
      {
        "name": "木曽平沢",
        "description": "漆器「木曽漆器」の産地として知られる町並みです。"
      },
      {
        "name": "高ボッチ高原",
        "description": "諏訪湖と富士山を見渡せる展望の高原です。"
      },
      {
        "name": "桔梗ヶ原",
        "description": "ワイン用ぶどうの産地として知られ、ワイナリーが集まります。"
      }
    ]
  },
  {
    "lgCode": "202177",
    "name": "佐久市",
    "kana": "さくし",
    "lat": 36.24888889,
    "lng": 138.4769444,
    "url": "https://www.city.saku.nagano.jp/",
    "catchphrase": "叡智と情熱が結ぶ、21世紀の新たな文化発祥都市",
    "spots": [
      {
        "name": "龍岡城五稜郭",
        "description": "函館の五稜郭と並ぶ、日本に二つしかない星形の城跡のひとつです。"
      }
    ]
  },
  {
    "lgCode": "202185",
    "name": "千曲市",
    "kana": "ちくまし",
    "lat": 36.530707,
    "lng": 138.114895,
    "url": "https://www.city.chikuma.lg.jp/",
    "catchphrase": "千曲の魅力と 多彩な力が 未来を拓（ひら）く 躍動の都市（まち）",
    "spots": [
      {
        "name": "姨捨の棚田",
        "description": "「田毎の月」で知られる棚田。国の重要文化的景観に選ばれています。"
      },
      {
        "name": "戸倉上山田温泉",
        "description": "千曲川沿いに広がる温泉地です。"
      },
      {
        "name": "森将軍塚古墳",
        "description": "長野県最大級の前方後円墳です。"
      }
    ]
  },
  {
    "lgCode": "202193",
    "name": "東御市",
    "kana": "とうみし",
    "lat": 36.35944444,
    "lng": 138.3305556,
    "url": "https://www.city.tomi.nagano.jp/",
    "catchphrase": "さわやかな風と出会いの元気発信都市　とうみし",
    "spots": [
      {
        "name": "海野宿",
        "description": "北国街道の宿場町。重要伝統的建造物群保存地区に選ばれています。"
      },
      {
        "name": "湯の丸高原",
        "description": "初夏にレンゲツツジの群落が咲く高原です。"
      }
    ]
  },
  {
    "lgCode": "202207",
    "name": "安曇野市",
    "kana": "あづみのし",
    "lat": 36.303933,
    "lng": 137.905755,
    "url": "https://www.city.azumino.nagano.jp/",
    "catchphrase": "自然を愛し、水と緑の薫るまち　安曇野",
    "spots": [
      {
        "name": "大王わさび農場",
        "description": "北アルプスの湧き水で育つわさび田の農場です。"
      },
      {
        "name": "碌山美術館",
        "description": "彫刻家・荻原守衛（碌山）の作品を展示する美術館です。"
      },
      {
        "name": "穂高神社",
        "description": "安曇野の穂高にある神社。奥宮は上高地にあります。"
      },
      {
        "name": "常念岳",
        "description": "安曇野から見える北アルプスの山。ピラミッドのような姿で知られます。",
        "lat": 36.333,
        "lng": 137.733
      }
    ]
  },
  {
    "lgCode": "203033",
    "name": "小海町",
    "kana": "こうみまち",
    "lat": 36.095,
    "lng": 138.4836111,
    "url": "https://www.koumi-town.jp/",
    "catchphrase": "人・まち・未来が輝く ふるさと こうみまち",
    "spots": [
      {
        "name": "松原湖",
        "description": "八ヶ岳のふもとにある湖です。"
      }
    ]
  },
  {
    "lgCode": "203041",
    "name": "川上村",
    "kana": "かわかみむら",
    "lat": 35.97555556,
    "lng": 138.5783333,
    "url": "https://www.vill.kawakami.nagano.jp/www/index.html",
    "catchphrase": "野菜王国・レタスの村　豊かさの湧き出る源流の里づくり",
    "spots": [
      {
        "name": "千曲川源流",
        "description": "日本一長い川・信濃川（千曲川）の源流がある村です。"
      },
      {
        "name": "廻り目平",
        "description": "岩場とキャンプ場で知られる、金峰山のふもとの平地です。"
      },
      {
        "name": "甲武信ヶ岳",
        "description": "甲斐・武蔵・信濃の境にある山で、千曲川の源流があります。",
        "lat": 35.917,
        "lng": 138.733
      }
    ]
  },
  {
    "lgCode": "203050",
    "name": "南牧村",
    "kana": "みなみまきむら",
    "lat": 36.02083333,
    "lng": 138.4922222,
    "url": "https://www.minamimakimura.jp/",
    "catchphrase": "信州・みなみまき村（長野県南佐久郡南牧村）～八ヶ岳野辺山高原 高原野菜と酪農、観光の村～",
    "spots": [
      {
        "name": "野辺山高原",
        "description": "八ヶ岳のふもとに広がる高原。JR線の最高地点があります。"
      },
      {
        "name": "国立天文台野辺山",
        "description": "大型の電波望遠鏡がある天文台です。"
      }
    ]
  },
  {
    "lgCode": "203068",
    "name": "南相木村",
    "kana": "みなみあいきむら",
    "lat": 36.03611111,
    "lng": 138.5469444,
    "url": "https://www.minamiaiki.jp/",
    "catchphrase": "信州ふるさと村　いっしょに歩こう、自然村　立原高原・南相木ダム・滝見の湯・御座山・天狗山など",
    "spots": []
  },
  {
    "lgCode": "203076",
    "name": "北相木村",
    "kana": "きたあいきむら",
    "lat": 36.05916667,
    "lng": 138.5511111,
    "url": "http://vill.kitaaiki.nagano.jp/",
    "catchphrase": "好きです信州　人の温もりが溢れる村　おいでよ「北相木」",
    "spots": [
      {
        "name": "栃原岩陰遺跡",
        "description": "縄文時代早期の人骨などが見つかった岩陰の遺跡です。"
      }
    ]
  },
  {
    "lgCode": "203092",
    "name": "佐久穂町",
    "kana": "さくほまち",
    "lat": 36.16111111,
    "lng": 138.4833333,
    "url": "https://www.town.sakuho.nagano.jp/",
    "catchphrase": "水と緑と光にあふれる東信濃佐久穂町　水と緑のうるおい 人の営みが奏でる未来のふるさと",
    "spots": [
      {
        "name": "八千穂高原",
        "description": "白樺の林が広がる高原です。"
      }
    ]
  },
  {
    "lgCode": "203211",
    "name": "軽井沢町",
    "kana": "かるいざわまち",
    "lat": 36.34833333,
    "lng": 138.5969444,
    "url": "https://www.town.karuizawa.lg.jp/www/index.html",
    "catchphrase": "『保健休養地』みんなで育み、未来につなげよう軽井沢のこころ",
    "spots": [
      {
        "name": "旧軽井沢銀座通り",
        "description": "店が立ち並ぶ旧軽井沢の中心の通りです。"
      },
      {
        "name": "白糸の滝",
        "description": "岩肌から地下水が幾筋もの白い糸のように流れ落ちる滝です。"
      },
      {
        "name": "雲場池",
        "description": "紅葉の名所として知られる池です。"
      },
      {
        "name": "旧三笠ホテル",
        "description": "明治時代に建てられた木造の西洋式ホテルで、国の重要文化財です。"
      },
      {
        "name": "碓氷峠",
        "description": "長野・群馬の県境の峠。見晴台からの眺めが知られます。",
        "lat": 36.35,
        "lng": 138.65
      }
    ]
  },
  {
    "lgCode": "203238",
    "name": "御代田町",
    "kana": "みよたまち",
    "lat": 36.322732,
    "lng": 138.506505,
    "url": "https://www.town.miyota.nagano.jp/",
    "catchphrase": "浅間山に抱かれた高原の町　みよたまち",
    "spots": [
      {
        "name": "浅間縄文ミュージアム",
        "description": "浅間山麓の縄文時代の出土品を展示するミュージアムです。"
      }
    ]
  },
  {
    "lgCode": "203246",
    "name": "立科町",
    "kana": "たてしなまち",
    "lat": 36.27194444,
    "lng": 138.3161111,
    "url": "https://www.town.tateshina.nagano.jp/",
    "catchphrase": "人と自然が輝く町",
    "spots": [
      {
        "name": "白樺湖",
        "description": "白樺の林に囲まれた湖。湖畔にリゾート施設が集まります。"
      },
      {
        "name": "女神湖",
        "description": "蓼科山のふもとにある湖です。"
      },
      {
        "name": "蓼科山",
        "description": "「諏訪富士」とも呼ばれる、円錐形の山です。",
        "lat": 36.1,
        "lng": 138.3
      }
    ]
  },
  {
    "lgCode": "203491",
    "name": "青木村",
    "kana": "あおきむら",
    "lat": 36.37,
    "lng": 138.1286111,
    "url": "https://www.vill.aoki.nagano.jp/",
    "catchphrase": "いで湯と文化の里 青木村 ～未来への創造～ 子どもの笑い声がこだまする郷（さと）",
    "spots": [
      {
        "name": "大法寺 三重塔",
        "description": "あまりの美しさに振り返ってしまうことから「見返りの塔」と呼ばれる国宝の塔です。"
      },
      {
        "name": "田沢温泉",
        "description": "古くからの湯治場の雰囲気が残る温泉地です。"
      }
    ]
  },
  {
    "lgCode": "203505",
    "name": "長和町",
    "kana": "ながわまち",
    "lat": 36.269903,
    "lng": 138.258071,
    "url": "https://town.nagawa.nagano.jp/",
    "catchphrase": "森のささやき 清らかな流れ 悠久の歴史 未来へ耀く 美しの郷",
    "spots": [
      {
        "name": "長門牧場",
        "description": "高原の牧場。乳製品が楽しめます。"
      },
      {
        "name": "黒耀石体験ミュージアム",
        "description": "旧石器・縄文時代の黒曜石の採掘や利用を伝えるミュージアムです。"
      },
      {
        "name": "和田峠",
        "description": "中山道の峠で、黒曜石の産地として知られます。",
        "lat": 36.15,
        "lng": 138.15
      }
    ]
  },
  {
    "lgCode": "203611",
    "name": "下諏訪町",
    "kana": "しもすわまち",
    "lat": 36.06972222,
    "lng": 138.0802778,
    "url": "https://www.town.shimosuwa.lg.jp/www/index.html",
    "catchphrase": "中山道と甲州街道が出会う 大社といで湯の宿場まち",
    "spots": [
      {
        "name": "諏訪大社 下社秋宮",
        "description": "諏訪大社の四つのお宮のひとつです。"
      },
      {
        "name": "諏訪大社 下社春宮",
        "description": "諏訪大社の四つのお宮のひとつです。"
      },
      {
        "name": "万治の石仏",
        "description": "大きな自然石に顔がのった独特の姿の石仏です。"
      },
      {
        "name": "下諏訪宿",
        "description": "中山道と甲州街道が合流する宿場町です。"
      }
    ]
  },
  {
    "lgCode": "203629",
    "name": "富士見町",
    "kana": "ふじみまち",
    "lat": 35.91472222,
    "lng": 138.2408333,
    "url": "https://www.town.fujimi.lg.jp/",
    "catchphrase": "世界に展かれた高原の文化都市　雄大な自然と美しい景観に恵まれた富士見高原の町",
    "spots": [
      {
        "name": "富士見パノラマリゾート",
        "description": "ゴンドラで入笠山方面に上がれるリゾートです。"
      },
      {
        "name": "入笠山",
        "description": "花の山として知られ、ゴンドラを使えば手軽に登れます。",
        "lat": 35.9,
        "lng": 138.167
      }
    ]
  },
  {
    "lgCode": "203637",
    "name": "原村",
    "kana": "はらむら",
    "lat": 35.96444444,
    "lng": 138.2175,
    "url": "https://www.vill.hara.lg.jp/",
    "catchphrase": "人も地域も輝く緑豊かな原村",
    "spots": [
      {
        "name": "八ヶ岳自然文化園",
        "description": "八ヶ岳の麓にある公園。星空観察などができます。"
      }
    ]
  },
  {
    "lgCode": "203823",
    "name": "辰野町",
    "kana": "たつのまち",
    "lat": 35.9825,
    "lng": 137.9875,
    "url": "https://www.town.tatsuno.lg.jp/index.html",
    "catchphrase": "ひともまちも自然も輝く 光と緑とほたるの町　たつの",
    "spots": [
      {
        "name": "ほたる童謡公園",
        "description": "ゲンジボタルの名所・松尾峡にある公園です。"
      },
      {
        "name": "日本中心の標",
        "description": "日本の中心とされる地点を示す標です。"
      }
    ]
  },
  {
    "lgCode": "203831",
    "name": "箕輪町",
    "kana": "みのわまち",
    "lat": 35.915,
    "lng": 137.9819444,
    "url": "https://www.town.minowa.lg.jp/",
    "catchphrase": "さわやか信州　人・地域が輝き 創造と活力あふれるまち 箕輪",
    "spots": [
      {
        "name": "赤そばの里",
        "description": "秋に赤い花のそばが一面に咲く畑です。"
      },
      {
        "name": "もみじ湖",
        "description": "紅葉の名所として知られるダム湖です。"
      }
    ]
  },
  {
    "lgCode": "203840",
    "name": "飯島町",
    "kana": "いいじままち",
    "lat": 35.67638889,
    "lng": 137.9194444,
    "url": "https://www.town.iijima.lg.jp/",
    "catchphrase": "信州いいじま ふたつのアルプスが見えるまち　人と緑輝く ふれあいのまち　勇気・挑戦・感動",
    "spots": [
      {
        "name": "千人塚公園",
        "description": "中央アルプスを望む池のある公園です。"
      }
    ]
  },
  {
    "lgCode": "203858",
    "name": "南箕輪村",
    "kana": "みなみみのわむら",
    "lat": 35.87277778,
    "lng": 137.9752778,
    "url": "https://www.vill.minamiminowa.lg.jp/",
    "catchphrase": "みんなで創ろう住みよい南箕輪　～人・自然・協働～",
    "spots": [
      {
        "name": "大芝高原",
        "description": "アカマツの林が広がる公園。温泉やキャンプ場があります。"
      }
    ]
  },
  {
    "lgCode": "203866",
    "name": "中川村",
    "kana": "なかがわむら",
    "lat": 35.63444444,
    "lng": 137.9461111,
    "url": "https://www.vill.nakagawa.nagano.jp/",
    "catchphrase": "一人ひとりの元気が活きる美しい村“なかがわ”　自然たっぷり 笑顔たっぷり やすらぎの村",
    "spots": [
      {
        "name": "陣馬形山",
        "description": "中央アルプスと南アルプスを見渡せる山。山頂にキャンプ場があります。"
      }
    ]
  },
  {
    "lgCode": "203882",
    "name": "宮田村",
    "kana": "みやだむら",
    "lat": 35.76888889,
    "lng": 137.9444444,
    "url": "https://www.vill.miyada.nagano.jp/?",
    "catchphrase": "人と自然にやさしい創造のみやだ　豊かな人文・住みよい宮田",
    "spots": [
      {
        "name": "駒ヶ岳（木曽駒ヶ岳）",
        "description": "中央アルプスの最高峰です。",
        "lat": 35.783,
        "lng": 137.8
      }
    ]
  },
  {
    "lgCode": "204021",
    "name": "松川町",
    "kana": "まつかわまち",
    "lat": 35.59722222,
    "lng": 137.9097222,
    "url": "https://www.town.matsukawa.lg.jp/",
    "catchphrase": "くだものの里 松川　人の輝く緑と水と太陽のまち まつかわ　－人の和のある地域協動のまち まつかわ－",
    "spots": []
  },
  {
    "lgCode": "204030",
    "name": "高森町",
    "kana": "たかもりまち",
    "lat": 35.55138889,
    "lng": 137.8786111,
    "url": "https://www.town.nagano-takamori.lg.jp/",
    "catchphrase": "育ちあい 支えあい、みんなで動かす元気な町 たかもり",
    "spots": [
      {
        "name": "市田柿の里",
        "description": "干し柿「市田柿」の発祥の地とされる町です。"
      }
    ]
  },
  {
    "lgCode": "204048",
    "name": "阿南町",
    "kana": "あなんちょう",
    "lat": 35.32361111,
    "lng": 137.8161111,
    "url": "http://www.town.anan.nagano.jp/",
    "catchphrase": "南信州 祭り街道の里　魅力あふれる交流（ふれあい）のまち　あなん",
    "spots": []
  },
  {
    "lgCode": "204072",
    "name": "阿智村",
    "kana": "あちむら",
    "lat": 35.44388889,
    "lng": 137.7475,
    "url": "https://www.vill.achi.lg.jp/",
    "catchphrase": "歴史と湯けむりの里",
    "spots": [
      {
        "name": "昼神温泉",
        "description": "阿智川沿いにある温泉地です。"
      },
      {
        "name": "ヘブンスそのはら",
        "description": "ゴンドラで上がる山の上から星空を眺めるツアーで知られます。"
      }
    ]
  },
  {
    "lgCode": "204099",
    "name": "平谷村",
    "kana": "ひらやむら",
    "lat": 35.32333333,
    "lng": 137.6302778,
    "url": "https://hirayamura.jp/",
    "catchphrase": "南信州・観光の村 平谷高原の里　歓びがゆきかう ぬくもりの里 ひらや",
    "spots": []
  },
  {
    "lgCode": "204102",
    "name": "根羽村",
    "kana": "ねばむら",
    "lat": 35.255296,
    "lng": 137.581784,
    "url": "https://nebamura.jp/",
    "catchphrase": "緑とやすらぎの里 みなみ信州 根羽村　緑と自然を生かしゆとりと安らぎのある村づくり",
    "spots": []
  },
  {
    "lgCode": "204111",
    "name": "下條村",
    "kana": "しもじょうむら",
    "lat": 35.3975,
    "lng": 137.7861111,
    "url": "https://www.vill-shimojo.jp/",
    "catchphrase": "瞳かがやく下條村",
    "spots": []
  },
  {
    "lgCode": "204129",
    "name": "売木村",
    "kana": "うるぎむら",
    "lat": 35.27111111,
    "lng": 137.7111111,
    "url": "https://www.urugi.jp/",
    "catchphrase": "信州の南の端。峠に囲まれた小さな山里、うるぎ村。",
    "spots": []
  },
  {
    "lgCode": "204137",
    "name": "天龍村",
    "kana": "てんりゅうむら",
    "lat": 35.27638889,
    "lng": 137.8544444,
    "url": "https://www.vill-tenryu.jp/",
    "catchphrase": "信州に春をつげる村　人と自然で協（かな）える 小国寡民（りそうきょう）のむら 天龍",
    "spots": []
  },
  {
    "lgCode": "204145",
    "name": "泰阜村",
    "kana": "やすおかむら",
    "lat": 35.37722222,
    "lng": 137.8458333,
    "url": "https://vill.yasuoka.nagano.jp/",
    "catchphrase": "風水薫る　ときめきの郷　やすおか",
    "spots": []
  },
  {
    "lgCode": "204153",
    "name": "喬木村",
    "kana": "たかぎむら",
    "lat": 35.51388889,
    "lng": 137.8738889,
    "url": "https://www.vill.takagi.lg.jp/",
    "catchphrase": "小さくともアルプスの峰の如（ごと）く毅然（きぜん）と聳（そび）える美しい村 喬木",
    "spots": []
  },
  {
    "lgCode": "204161",
    "name": "豊丘村",
    "kana": "とよおかむら",
    "lat": 35.55138889,
    "lng": 137.8958333,
    "url": "https://www.vill.nagano-toyooka.lg.jp/",
    "catchphrase": "心ふれあい しあわせ実感 うるおいの郷 とよおか",
    "spots": []
  },
  {
    "lgCode": "204170",
    "name": "大鹿村",
    "kana": "おおしかむら",
    "lat": 35.57833333,
    "lng": 138.0341667,
    "url": "https://www.vill.ooshika.nagano.jp/",
    "catchphrase": "南アルプスと歌舞伎の里　ゆとりと感動 楽しみを発見する 大鹿村",
    "spots": [
      {
        "name": "中央構造線博物館",
        "description": "日本列島を貫く断層「中央構造線」を紹介する博物館です。"
      },
      {
        "name": "大鹿歌舞伎",
        "description": "村の人々が受け継いできた地芝居です。"
      },
      {
        "name": "塩見岳",
        "description": "南アルプスの中央にそびえる山です。",
        "lat": 35.567,
        "lng": 138.183
      }
    ]
  },
  {
    "lgCode": "204226",
    "name": "上松町",
    "kana": "あげまつまち",
    "lat": 35.782187,
    "lng": 137.693235,
    "url": "https://www.town.agematsu.nagano.jp/",
    "catchphrase": "ひのきの里・あげまつ　世界に誇る木曽檜 水と緑がいやす郷",
    "spots": [
      {
        "name": "寝覚の床",
        "description": "木曽川の水の流れが削った花こう岩の奇岩が連なる名勝です。"
      },
      {
        "name": "赤沢自然休養林",
        "description": "木曽ヒノキの美林で、森林浴発祥の地とされます。"
      }
    ]
  },
  {
    "lgCode": "204234",
    "name": "南木曽町",
    "kana": "なぎそまち",
    "lat": 35.60361111,
    "lng": 137.6088889,
    "url": "https://www.town.nagiso.nagano.jp/",
    "catchphrase": "歴史とひのきの薫る里",
    "spots": [
      {
        "name": "妻籠宿",
        "description": "中山道の宿場町。古い町並みが保存されています。"
      },
      {
        "name": "桃介橋",
        "description": "木曽川に架かる大正時代の木造の吊り橋です。"
      },
      {
        "name": "田立の滝",
        "description": "いくつもの滝が連なる渓谷で、日本の滝百選に選ばれています。"
      }
    ]
  },
  {
    "lgCode": "204251",
    "name": "木祖村",
    "kana": "きそむら",
    "lat": 35.93638889,
    "lng": 137.7830556,
    "url": "https://www.vill.kiso.nagano.jp/",
    "catchphrase": "木曽川の水が生まれる源流の里 信州木祖村",
    "spots": [
      {
        "name": "藪原宿",
        "description": "中山道の宿場町で、櫛づくりの伝統で知られます。"
      },
      {
        "name": "鳥居峠",
        "description": "中山道の峠。奈良井宿と藪原宿を結ぶ古道が残ります。",
        "lat": 35.95,
        "lng": 137.8
      }
    ]
  },
  {
    "lgCode": "204293",
    "name": "王滝村",
    "kana": "おうたきむら",
    "lat": 35.80944444,
    "lng": 137.5511111,
    "url": "https://www.vill.otaki.nagano.jp/",
    "catchphrase": "霊峰御嶽山の麓　水と緑のふるさと　現在（いま）を変えよう 未来をつくろう みんなの知恵で みんなで支えあう心の手による地域づくり",
    "spots": [
      {
        "name": "御嶽山",
        "description": "古くから信仰の山として知られます。登山の際は火山情報を確認してください。",
        "lat": 35.9,
        "lng": 137.467
      }
    ]
  },
  {
    "lgCode": "204307",
    "name": "大桑村",
    "kana": "おおくわむら",
    "lat": 35.68277778,
    "lng": 137.665,
    "url": "https://www.vill.okuwa.lg.jp/",
    "catchphrase": "ヒノキを奏でる里 大桑村　人が、暮らしが、自然が……健康です　サンライズおおくわ",
    "spots": [
      {
        "name": "阿寺渓谷",
        "description": "透き通ったエメラルドグリーンの水で知られる渓谷です。"
      }
    ]
  },
  {
    "lgCode": "204323",
    "name": "木曽町",
    "kana": "きそまち",
    "lat": 35.8425,
    "lng": 137.6916667,
    "url": "https://www.town-kiso.com/",
    "catchphrase": "日本のふるさと・豊かな水と緑あふるる故郷、木曽",
    "spots": [
      {
        "name": "開田高原",
        "description": "御嶽山を望む高原。木曽馬の里があります。"
      },
      {
        "name": "福島関所跡",
        "description": "中山道の重要な関所の跡です。"
      }
    ]
  },
  {
    "lgCode": "204463",
    "name": "麻績村",
    "kana": "おみむら",
    "lat": 36.45611111,
    "lng": 138.0452778,
    "url": "https://www.vill.omi.nagano.jp/",
    "catchphrase": "自然あふれる曼荼羅の里 おみ村",
    "spots": [
      {
        "name": "聖高原",
        "description": "聖湖がある高原です。"
      }
    ]
  },
  {
    "lgCode": "204480",
    "name": "生坂村",
    "kana": "いくさかむら",
    "lat": 36.42527778,
    "lng": 137.9275,
    "url": "https://www.village.ikusaka.nagano.jp/",
    "catchphrase": "心ふれあう豊かな村づくり　やまなみに抱かれ いつまでも楽しく暮らせる 未来を創り出す村",
    "spots": []
  },
  {
    "lgCode": "204501",
    "name": "山形村",
    "kana": "やまがたむら",
    "lat": 36.16805556,
    "lng": 137.8788889,
    "url": "https://www.vill.yamagata.nagano.jp/index.html",
    "catchphrase": "道祖神とそばの里　暮らしと自然が響き合う村",
    "spots": []
  },
  {
    "lgCode": "204510",
    "name": "朝日村",
    "kana": "あさひむら",
    "lat": 36.129115,
    "lng": 137.867267,
    "url": "https://www.vill.asahi.nagano.jp/",
    "catchphrase": "心・体・地の調和　新しい感覚で 人と自然と産業が共生するむらづくり",
    "spots": []
  },
  {
    "lgCode": "204528",
    "name": "筑北村",
    "kana": "ちくほくむら",
    "lat": 36.402654,
    "lng": 138.011775,
    "url": "https://www.vill.chikuhoku.lg.jp/",
    "catchphrase": "自然に恵まれた「安心」と「活力」のあふれるむら",
    "spots": [
      {
        "name": "冠着山（姨捨山）",
        "description": "姨捨伝説で知られる山です。",
        "lat": 36.467,
        "lng": 138.1
      }
    ]
  },
  {
    "lgCode": "204811",
    "name": "池田町",
    "kana": "いけだまち",
    "lat": 36.42138889,
    "lng": 137.8747222,
    "url": "https://www.ikedamachi.net/",
    "catchphrase": "北アルプス展望の里・花とハーブの里　信州あずみ野 池田町",
    "spots": [
      {
        "name": "大峰高原の七色大カエデ",
        "description": "秋に色とりどりに紅葉する大きなカエデの木です。"
      }
    ]
  },
  {
    "lgCode": "204820",
    "name": "松川村",
    "kana": "まつかわむら",
    "lat": 36.42416667,
    "lng": 137.8544444,
    "url": "https://www.vill.matsukawa.nagano.jp/",
    "catchphrase": "水清き　信州安曇野・松川村　みんなが主人公「未来へはばたく、光り輝く協働の村」",
    "spots": [
      {
        "name": "安曇野ちひろ美術館",
        "description": "絵本画家・いわさきちひろの作品を展示する美術館です。"
      }
    ]
  },
  {
    "lgCode": "204854",
    "name": "白馬村",
    "kana": "はくばむら",
    "lat": 36.69833333,
    "lng": 137.8622222,
    "url": "https://www.vill.hakuba.nagano.jp/",
    "catchphrase": "白馬の里に ひと集い くらし健やか むらごと自然公園　アルプスの街 白馬",
    "spots": [
      {
        "name": "八方尾根",
        "description": "白馬のスキー場と、雪のない時期のトレッキングで知られます。"
      },
      {
        "name": "白馬岳",
        "description": "高山植物と大雪渓で知られる北アルプスの山です。",
        "lat": 36.767,
        "lng": 137.767
      },
      {
        "name": "唐松岳",
        "description": "八方尾根から登れる北アルプスの山です。",
        "lat": 36.683,
        "lng": 137.75
      },
      {
        "name": "五竜岳",
        "description": "北アルプス後立山連峰の山です。",
        "lat": 36.667,
        "lng": 137.75
      }
    ]
  },
  {
    "lgCode": "204862",
    "name": "小谷村",
    "kana": "おたりむら",
    "lat": 36.77916667,
    "lng": 137.9083333,
    "url": "https://www.vill.otari.nagano.jp/www/menu.html",
    "catchphrase": "緑と雪と温泉のふるさと 信州おたり",
    "spots": [
      {
        "name": "栂池自然園",
        "description": "湿原や高山植物が見られる自然園です。"
      },
      {
        "name": "小谷温泉",
        "description": "山あいにある古い温泉地です。"
      },
      {
        "name": "雨飾山",
        "description": "長野・新潟の県境の山で、日本百名山のひとつです。",
        "lat": 36.9,
        "lng": 137.967
      }
    ]
  },
  {
    "lgCode": "205214",
    "name": "坂城町",
    "kana": "さかきまち",
    "lat": 36.46194444,
    "lng": 138.1802778,
    "url": "https://www.town.sakaki.nagano.jp/www/index.html",
    "catchphrase": "ものづくりとやすらぎのまち　自律する個性あふれるまちづくりをめざして",
    "spots": []
  },
  {
    "lgCode": "205419",
    "name": "小布施町",
    "kana": "おぶせまち",
    "lat": 36.69777778,
    "lng": 138.3122222,
    "url": "https://www.town.obuse.nagano.jp/",
    "catchphrase": "栗と北斎と花のまち　心に響く21世紀　夢を力に　輝く未来へ",
    "spots": [
      {
        "name": "北斎館",
        "description": "葛飾北斎の肉筆画や祭り屋台の天井絵を展示する美術館です。"
      },
      {
        "name": "岩松院",
        "description": "葛飾北斎が描いた天井絵「八方睨み鳳凰図」がある寺院です。"
      },
      {
        "name": "栗の小径",
        "description": "栗の木の間伐材を敷き詰めた散策路です。"
      }
    ]
  },
  {
    "lgCode": "205435",
    "name": "高山村",
    "kana": "たかやまむら",
    "lat": 36.67972222,
    "lng": 138.3630556,
    "url": "https://www.vill.takayama.nagano.jp/",
    "catchphrase": "ひと・むら・自然がきらめく 信州高山　～ 気づいて築く わがふるさと ～",
    "spots": [
      {
        "name": "山田温泉",
        "description": "松川渓谷の近くにある温泉地です。"
      },
      {
        "name": "松川渓谷",
        "description": "紅葉の名所として知られる渓谷です。"
      }
    ]
  },
  {
    "lgCode": "205613",
    "name": "山ノ内町",
    "kana": "やまのうちまち",
    "lat": 36.74472222,
    "lng": 138.4125,
    "url": "https://www.town.yamanouchi.nagano.jp/",
    "catchphrase": "自然と湯ったり・・・やまのうち　人と自然を育み、次世代へつなげる　温もりのあるまち",
    "spots": [
      {
        "name": "地獄谷野猿公苑",
        "description": "温泉に入るサルが見られることで知られます。"
      },
      {
        "name": "渋温泉",
        "description": "石畳の路地に旅館が並び、九つの外湯めぐりで知られる温泉地です。"
      },
      {
        "name": "志賀高原",
        "description": "スキー場と池・湿原が点在する高原。ユネスコエコパークの一部です。"
      },
      {
        "name": "横手山",
        "description": "志賀高原の山。山頂近くまでリフトで上がれます。",
        "lat": 36.667,
        "lng": 138.533
      },
      {
        "name": "渋峠",
        "description": "国道292号の峠で、長野・群馬の県境にあります。",
        "lat": 36.667,
        "lng": 138.533
      }
    ]
  },
  {
    "lgCode": "205621",
    "name": "木島平村",
    "kana": "きじまだいらむら",
    "lat": 36.85861111,
    "lng": 138.4066667,
    "url": "https://www.vill.kijimadaira.lg.jp/",
    "catchphrase": "自然劇場 きじま平",
    "spots": [
      {
        "name": "カヤの平高原",
        "description": "ブナの原生林と牧場がある高原です。"
      }
    ]
  },
  {
    "lgCode": "205630",
    "name": "野沢温泉村",
    "kana": "のざわおんせんむら",
    "lat": 36.92277778,
    "lng": 138.4405556,
    "url": "https://www.vill.nozawaonsen.nagano.jp/",
    "catchphrase": "四季の自然に彩られた　ぬくもりの湯の郷・野沢温泉村",
    "spots": [
      {
        "name": "野沢温泉 大湯",
        "description": "野沢温泉の外湯のひとつで、温泉街の中心にあります。"
      },
      {
        "name": "麻釜",
        "description": "野菜をゆでることもできる高温の源泉です。"
      },
      {
        "name": "野沢温泉スキー場",
        "description": "温泉街から行ける大きなスキー場です。"
      }
    ]
  },
  {
    "lgCode": "205834",
    "name": "信濃町",
    "kana": "しなのまち",
    "lat": 36.80638889,
    "lng": 138.2069444,
    "url": "https://www.town.shinano.lg.jp/",
    "catchphrase": "思わず深呼吸 心に花咲く 信州 信濃町　美しい おいしい 安心豊か 自然の恵みを楽しむ町",
    "spots": [
      {
        "name": "野尻湖",
        "description": "ナウマンゾウの化石が見つかったことで知られる湖です。"
      },
      {
        "name": "一茶記念館",
        "description": "俳人・小林一茶のふるさとにある記念館です。"
      },
      {
        "name": "黒姫高原",
        "description": "黒姫山のふもとに広がる高原です。",
        "lat": 36.817,
        "lng": 138.133
      }
    ]
  },
  {
    "lgCode": "205885",
    "name": "小川村",
    "kana": "おがわむら",
    "lat": 36.61694444,
    "lng": 137.9744444,
    "url": "https://www.vill.ogawa.nagano.jp/",
    "catchphrase": "豊かな自然…星のふる里 信州小川村",
    "spots": []
  },
  {
    "lgCode": "205907",
    "name": "飯綱町",
    "kana": "いいづなまち",
    "lat": 36.755,
    "lng": 138.2355556,
    "url": "https://www.town.iizuna.nagano.jp/",
    "catchphrase": "ひと自然いきいき未来　飯綱のふところに抱かれた 豊かなこころのふるさとをめざして",
    "spots": [
      {
        "name": "霊仙寺湖",
        "description": "飯縄山のふもとにある湖です。"
      }
    ]
  },
  {
    "lgCode": "206024",
    "name": "栄村",
    "kana": "さかえむら",
    "lat": 36.9875,
    "lng": 138.5775,
    "url": "http://www.vill.sakae.nagano.jp/",
    "catchphrase": "緑豊かな心やすらぐ村 北信州栄村",
    "spots": [
      {
        "name": "秋山郷",
        "description": "長野・新潟の県境に広がる山あいの集落と温泉の里です。"
      },
      {
        "name": "鳥甲山",
        "description": "秋山郷にそびえる険しい岩の山です。",
        "lat": 36.833,
        "lng": 138.583
      }
    ]
  }
];
