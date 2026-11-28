// Deuce's brain: working out what was said. "Put on the Knicks game", "open Netflix",
// "switch to the PlayStation", "timer for ten minutes". Plain JavaScript with no screen,
// so Node tests it too. No cloud AI: what you say stays on the TV.
// In the browser it becomes window.DeuceBrain; in Node, require('./js/deucebrain.js').
(function (root) {
  'use strict';
  const Calc = typeof module !== 'undefined' && module.exports ? require('./deucecalc.js') : root.DeuceCalc;

  // ---- the teams: city|nickname, then other names people use ----------------------------------
  const LEAGUES = {
    nba: { sport: 'basketball', name: 'NBA', months: [10, 11, 12, 1, 2, 3, 4, 5, 6], teams:
      'Atlanta|Hawks;Boston|Celtics;Brooklyn|Nets;Charlotte|Hornets;Chicago|Bulls;Cleveland|Cavaliers|cavs;Dallas|Mavericks|mavs;Denver|Nuggets;Detroit|Pistons;Golden State|Warriors|dubs;' +
      'Houston|Rockets;Indiana|Pacers;LA|Clippers;Los Angeles|Lakers;Memphis|Grizzlies|grizz;Miami|Heat;Milwaukee|Bucks;Minnesota|Timberwolves|wolves,t wolves;New Orleans|Pelicans|pels;' +
      'New York|Knicks|knickerbockers;Oklahoma City|Thunder|okc;Orlando|Magic;Philadelphia|76ers|sixers,seventy sixers;Phoenix|Suns;Portland|Trail Blazers|blazers;Sacramento|Kings;' +
      'San Antonio|Spurs;Toronto|Raptors;Utah|Jazz;Washington|Wizards' },
    nfl: { sport: 'football', name: 'NFL', months: [9, 10, 11, 12, 1, 2], teams:
      'Arizona|Cardinals;Atlanta|Falcons;Baltimore|Ravens;Buffalo|Bills;Carolina|Panthers;Chicago|Bears;Cincinnati|Bengals;Cleveland|Browns;Dallas|Cowboys;Denver|Broncos;Detroit|Lions;' +
      'Green Bay|Packers|pack;Houston|Texans;Indianapolis|Colts;Jacksonville|Jaguars|jags;Kansas City|Chiefs;Las Vegas|Raiders;Los Angeles|Chargers|bolts;Los Angeles|Rams;Miami|Dolphins|fins;' +
      'Minnesota|Vikings|vikes;New England|Patriots|pats;New Orleans|Saints;New York|Giants|big blue;New York|Jets;Philadelphia|Eagles|birds;Pittsburgh|Steelers;San Francisco|49ers|niners,forty niners;' +
      'Seattle|Seahawks|hawks;Tampa Bay|Buccaneers|bucs;Tennessee|Titans;Washington|Commanders' },
    mlb: { sport: 'baseball', name: 'MLB', months: [3, 4, 5, 6, 7, 8, 9, 10], teams:
      'Arizona|Diamondbacks|d backs,dbacks;Sacramento|Athletics|a s,as;Atlanta|Braves;Baltimore|Orioles|o s;Boston|Red Sox;Chicago|Cubs;Chicago|White Sox;Cincinnati|Reds;Cleveland|Guardians;' +
      'Colorado|Rockies;Detroit|Tigers;Houston|Astros|stros;Kansas City|Royals;Los Angeles|Angels|halos;Los Angeles|Dodgers;Miami|Marlins;Milwaukee|Brewers;Minnesota|Twins;New York|Mets;' +
      'New York|Yankees|yanks;Philadelphia|Phillies|phils;Pittsburgh|Pirates|bucs;San Diego|Padres;San Francisco|Giants;Seattle|Mariners;St Louis|Cardinals|cards;Tampa Bay|Rays;Texas|Rangers;' +
      'Toronto|Blue Jays|jays;Washington|Nationals|nats' },
    nhl: { sport: 'hockey', name: 'NHL', months: [10, 11, 12, 1, 2, 3, 4, 5, 6], teams:
      'Anaheim|Ducks;Boston|Bruins|bs;Buffalo|Sabres;Calgary|Flames;Carolina|Hurricanes|canes;Chicago|Blackhawks;Colorado|Avalanche|avs;Columbus|Blue Jackets;Dallas|Stars;Detroit|Red Wings|wings;' +
      'Edmonton|Oilers;Florida|Panthers|cats;Los Angeles|Kings;Minnesota|Wild;Montreal|Canadiens|habs;Nashville|Predators|preds;New Jersey|Devils;New York|Islanders|isles;New York|Rangers|blueshirts;' +
      'Ottawa|Senators|sens;Philadelphia|Flyers;Pittsburgh|Penguins|pens;San Jose|Sharks;Seattle|Kraken;St Louis|Blues;Tampa Bay|Lightning|bolts;Toronto|Maple Leafs|leafs;Utah|Mammoth;' +
      'Vancouver|Canucks;Vegas|Golden Knights|knights;Washington|Capitals|caps;Winnipeg|Jets' },
  };
  const TEAMS = [];
  Object.keys(LEAGUES).forEach((lg) => LEAGUES[lg].teams.split(';').forEach((t) => {
    const [city, nick, also] = t.split('|');
    TEAMS.push({ league: lg, sport: LEAGUES[lg].sport, city, nick, names: [nick.toLowerCase()].concat(also ? also.split(',') : []), full: (lg === 'mlb' && nick === 'Athletics' ? '' : city + ' ') + nick });
  }));

  // ---- words ------------------------------------------------------------------------------------
  const clean = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/\+/g, ' plus ').replace(/[^a-z0-9.:\s-]/g, ' ').replace(/(\D)\.|\.(\D)/g, '$1 $2').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const has = (text, words) => new RegExp('(^| )(' + words + ')( |$)').test(text);
  const NUMS = { zero: 0, oh: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
  // "twenty five" → 25, "a" → 1, "45" → 45
  function number(words) {
    const w = String(words).trim().split(' ');
    if (/^\d+(\.\d+)?$/.test(w[0])) return parseFloat(w[0]);
    let n = 0, any = false;
    for (const x of w) {
      if (!(x in NUMS)) break;
      any = true;
      n = x === 'hundred' ? (n || 1) * 100 : n + NUMS[x];
    }
    return any ? n : NaN;
  }
  const NW = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\\b';
  const NUMWORD = '\\d+(?:\\.\\d+)?|' + NW + '(?: ' + NW + ')*';

  // ---- TV networks (as people say them, and as listings write them) --------------------------
  // → the channel's id in Dice's TV guide (js/watch.js)
  const NETS = [
    ['msg sportsnet|msgsn|msg sn|msg 2|msg2|msg plus|msg sports net', 'msgsn'], ['msg|madison square garden network|madison square garden', 'msg'], ['yes network|yes', 'yes'], ['sny', 'sny'],
    ['espn 2|espn2|espnu|espn news|espnews|espn plus|espn deportes|espn unlimited|sec network|secn|acc network|accn|espn', 'espn'],
    ['abc', 'abc'], ['nbc sports|nbc', 'nbc'], ['peacock', 'peacock'], ['cbs sports network|cbssn|cbs sports|cbs', 'cbs'], ['paramount plus|paramount', 'paramount'],
    ['fox sports 1|fs1|fs 1|fox sports 2|fs2|big ten network|btn|fox deportes', 'fs1'], ['fox one', 'foxone'], ['fox sports|fox', 'fox'], ['pbs|thirteen', 'pbs'],
    ['tnt sports|tnt|tbs|trutv|tru tv', 'tnt'], ['hbo max|max|hbo', 'hbomax'], ['amazon prime video|prime video|amazon prime|amazon|prime', 'prime'],
    ['nba tv', 'nbatv'], ['nba league pass|league pass', 'nba'], ['nfl network|nfln|nfl redzone|redzone|red zone|nfl plus', 'nfln'], ['nfl sunday ticket|sunday ticket', 'ytv'],
    ['mlb network|mlbn|mlb tv|mlb.tv', 'mlbn'], ['nhl network', 'nhln'], ['apple tv plus|apple tv|mls season pass', 'apple'], ['netflix', 'netflix'], ['youtube tv', 'ytv'], ['youtube', 'youtube'],
    ['dazn', 'dazn'], ['fanduel sports network|fanduel sports|bally sports', 'fdsn'], ['nesn', 'nesn'], ['usa network|usa', 'usa'], ['cnbc', 'cnbc'],
  ].map(([words, id]) => ({ re: new RegExp('(^| )(' + words.replace(/\./g, '\\.') + ')( |$)'), words: words.split('|'), id }));
  // a network named anywhere in a listing ("ESPN2/ESPN+" → espn)
  function netOf(name) {
    const t = clean(name);
    const hit = NETS.find((n) => n.re.test(t));
    return hit ? hit.id : null;
  }
  // only a network's name, and nothing else ("msg", "the nbc")
  const netExactly = (word) => { const hit = NETS.find((n) => n.words.includes(word)); return hit ? hit.id : null; };

  // ---- the teams said ---------------------------------------------------------------------------
  // by nickname ("Knicks", "the Pats"), else by city ("the Boston game") — maybe more than one
  function teamsIn(text) {
    const t = clean(text);
    let hits = TEAMS.filter((tm) => tm.names.some((n) => has(t, n.replace(/ /g, ' '))));
    // a city with a nickname ("new york giants") narrows it
    if (hits.length > 1) { const both = hits.filter((tm) => has(t, clean(tm.city))); if (both.length) hits = both; }
    if (!hits.length) {
      const cities = TEAMS.filter((tm) => has(t, clean(tm.city)) || (tm.city === 'New York' && has(t, 'ny')) || (tm.city === 'Los Angeles' && has(t, 'la')));
      // a whole city's teams, only if a sport or "game" makes it clear
      if (cities.length) hits = cities;
    }
    return hits;
  }
  // which of them are playing this time of year (December: football, basketball and hockey)
  function inSeason(teams, month) {
    const on = teams.filter((tm) => LEAGUES[tm.league].months.includes(month));
    return on.length ? on : teams;
  }

  // ---- understanding --------------------------------------------------------------------------
  const APPS = [
    // Dice's own
    ['settings|setting', 'dice:settings'], ['files|my files|file', 'dice:files'], ['photos|pictures|my photos|my pictures|photo', 'dice:photos'], ['music|dice radio|radio', 'dice:music'],
    ['weather', 'dice:weather'], ['notes', 'dice:notes'], ['store|app store|the store', 'dice:store'], ['clock|alarms|alarm clock', 'dice:clock'], ['channels|dice channels', 'dice:channels'],
    ['dice cloud|cloud', 'dice:cloud'], ['axiom|calendar|homework', 'dice:calendar'], ['calculator', 'dice:calc'], ['terminal', 'dice:terminal'], ['cloud pc|dice cloud pc', 'dice:cloudpc'],
    ['inputs|hdmi inputs|devices', 'dice:inputs'], ['tv guide|guide|live tv|tv channels', 'dice:guide'],
    // streaming
    ['netflix', 'netflix'], ['youtube tv', 'ytv'], ['youtube music', 'ytmusic'], ['youtube|you tube', 'youtube'], ['disney plus|disney', 'disney'], ['hulu plus live tv|hulu live', 'hululive'], ['hulu', 'hulu'],
    ['prime video|amazon prime|amazon|prime', 'prime'], ['hbo max|max|hbo', 'hbomax'], ['peacock', 'peacock'], ['paramount plus|paramount', 'paramount'], ['apple tv plus|apple tv', 'apple'],
    ['spotify', 'spotify'], ['twitch', 'twitch'], ['tubi', 'tubi'], ['pluto tv|pluto', 'pluto'], ['crunchyroll', 'crunchyroll'], ['dazn', 'dazn'], ['espn', 'espn'], ['fox one', 'foxone'],
    ['fubo|fubo tv', 'fubo'], ['sling|sling tv', 'sling'], ['directv stream|directv|direct tv', 'directv'], ['nba league pass|league pass', 'nba'], ['nfl plus', 'nfl'], ['mlb tv', 'mlb'],
  ].map(([words, id]) => ({ re: new RegExp('^(?:the )?(' + words + ')(?: app)?$'), id }));
  const appOf = (s) => { const t = clean(s); const a = APPS.find((x) => x.re.test(t)); return a ? a.id : null; };
  const DEVICES = 'playstation 5|playstation 4|playstation|ps5|ps4|ps 5|ps 4|xbox|nintendo switch|nintendo|the switch|switch 2|apple tv box|fire tv|firestick|fire stick|roku|chromecast|google tv|cable box|cable|satellite|blu ray|bluray|dvd|steam deck|game console|console|display ?port|usb c|type c|' +
    '(?:[a-z0-9]+ )?(?:computer|laptop|pc|mac|macbook|desktop)';

  // ctx.inputs: the names you gave your inputs ("work laptop"), so "switch to the work laptop" works
  function understand(said, now, ctx) {
    now = now || new Date();
    ctx = ctx || {};
    let t = clean(said);
    // what isn't the request: "hey deuce", "please", "can you"
    t = t.replace(/^(hey |ok |okay |hi |yo )?deuce\b ?/, '').replace(/^(please |can you |could you |would you |will you |i want to |i wanna |id like to |lets |let s |go ahead and )+/, '').replace(/ please$/, '').trim();
    if (!t) return { kind: 'none' };
    const r = (kind, o) => Object.assign({ kind, text: t }, o || {});

    if (/^(help|what can you do|what do you do|how do i use you|what can i say)/.test(t)) return r('help');
    if (/^(never ?mind|cancel|stop listening|forget it|nothing|no thanks)$/.test(t)) return r('cancel');
    if (/^(go )?(back|go back)$/.test(t)) return r('back');
    if (/^(go )?(home|go home|take me home|home screen|main menu)$/.test(t) || /^(close|exit|quit)( (this|it|the app|that))?$/.test(t)) return r('home');

    // sums and conversions, worked out here: "15% of 80", "5 miles in km" (from what was said, symbols and all)
    const raw = String(said || '').replace(/^\s*(hey |ok |okay )?deuce,?\s*/i, '');
    if (Calc && Calc.looks(raw)) return r('calc', { expr: raw });
    // a morning briefing
    if (/^(good morning|morning|brief me|(my |the )?(daily |morning )?briefing|whats (on|happening) today|what do i have (on )?today|whats my day( look like)?|how does my day look|catch me up|whats up today)$/.test(t)) return r('brief');
    // the time somewhere else, and how long until a day
    let mt;
    if ((mt = /^(?:what time is it|whats the time|what is the time|time|the time|current time|what time)(?: right now| now)? in ([a-z .]+)$/.exec(t))) { const z = zoneOf(mt[1]); if (z) return r('time', { place: z[0], tz: z[1] }); }
    if ((mt = /^(?:how (?:many|much) (?:days?|weeks?|time)|how long|days|count ?down)(?: is it| are there| left)? (?:until|till|til|to|before) (.+?)\??$/.exec(t))) { const u = untilOf(mt[1], now); if (u) return r('until', u); }

    // ---- reminders, the Notebook, notes (Deuce for PC, and the TV too) ----
    let m;
    if (/^(remind me|set a reminder|make a reminder|add a reminder|reminder)\b/.test(t)) return r('remind', reminder(t, now));
    if (/^(what do you know about me|what do you remember|what have you remembered|whats in (my|your) notebook|show (me )?(my|your) notebook|(open )?(the |my )?notebook)$/.test(t)) return r('notebook');
    m = /^(?:forget|dont remember|stop remembering) (?:that |about )?(.+)$/.exec(t);
    if (m) return r('forget', { fact: /^(everything|it all|all of it|what you know about me)$/.test(m[1]) ? '' : m[1] });
    m = /^(?:remember|keep in mind|note to self|dont forget) (?:that )?(.+)$/.exec(t);
    if (m && !/^(when|what|where|how)\b/.test(m[1])) {
      if (/\b(password|passcode|pass code|pin|pin number|social security|credit card|card number|bank)\b/.test(m[1])) return r('remember', { secret: true });
      return r('remember', { fact: m[1] });
    }
    m = /^(?:my name is|call me|i go by) (.+)$/.exec(t);
    if (m) return r('remember', { fact: 'my name is ' + m[1], name: m[1].replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 30) });
    m = /^(?:take a note|make a note|new note|add a note|write down|jot down|note)(?: that| saying| to)? (.+)$/.exec(t);
    if (m) return r('note', { note: m[1] });

    // ---- the computer: how it looks, modes, Shield, screenshots, your week ----
    m = /^(?:turn |switch |go |put )?(?:on |to |into )?(dark|night|light|day) (?:mode|theme)(?: on)?$|^(?:turn on|switch to|use) (?:the )?(dark|night|light|day) (?:mode|theme|look)$/.exec(t);
    if (m) return r('setting', { what: 'look', value: /dark|night/.test(m[1] || m[2]) ? 'night' : 'day' });
    m = /^(?:turn |switch )?(on|off) (?:the )?night ?light$|^(?:turn |switch )?(?:the )?night ?light (on|off)$/.exec(t);
    if (m) return r('setting', { what: 'warm', value: (m[1] || m[2]) === 'on' });
    m = /^(?:turn |switch )?(on|off) (?:the )?(?:traced|heavenly)(?: looks| mode)?$|^(?:turn |switch )?(?:the )?(?:traced|heavenly)(?: looks| mode)? (on|off)$|^(?:start |use |switch to )?(traced mode|go traced|make it traced|make it look hand ?drawn)$/.exec(t);
    if (m) return r('setting', { what: 'looks', value: m[3] ? true : (m[1] || m[2]) === 'on' });
    m = /^(?:turn |switch )?(on|off) (?:do not disturb|dnd)$|^(?:turn |switch )?(?:do not disturb|dnd) (on|off)$|^(dont disturb me|do not disturb|quiet please|no notifications)$/.exec(t);
    if (m) return r('setting', { what: 'quiet', value: m[3] ? true : (m[1] || m[2]) === 'on' });
    m = /^(?:turn |switch )?(on|off) (?:the )?bluetooth$|^(?:turn |switch )?(?:the )?bluetooth (on|off)$/.exec(t);
    if (m) return r('setting', { what: 'bluetooth', value: (m[1] || m[2]) === 'on' });
    m = new RegExp('^(?:set |turn |change )?(?:the )?(?:screen )?brightness (?:to |at )?(' + NUMWORD + ')(?: percent)?$').exec(t);
    if (m && !isNaN(number(m[1]))) { const n = number(m[1]); return r('setting', { what: 'bright', value: Math.max(0.1, Math.min(1, n > 10 ? n / 100 : n / 10)) }); }
    if (/^(brighter|make it brighter|turn (up )?the brightness( up)?|more brightness)$/.test(t)) return r('setting', { what: 'bright', delta: 0.15 });
    if (/^(dimmer|darker|make it dimmer|make it darker|dim the screen|turn (down )?the brightness( down)?|less brightness)$/.test(t)) return r('setting', { what: 'bright', delta: -0.15 });
    m = /^(?:end|stop|turn off|leave|exit|cancel|quit) (?:the |my )?(?:([a-z ]{2,20}?) )?mode$|^(?:([a-z ]{2,20}?) mode off)$/.exec(t);
    if (m && !/^(dark|night|light|day|heavenly|traced)$/.test(m[1] || m[2] || '')) return r('mode', { off: true, name: m[1] || m[2] || '' });
    m = /^(?:start|turn on|switch to|go into|enter|begin|use|im in) (?:the |my )?([a-z ]{2,20}?) mode$|^([a-z ]{2,20}?) mode(?: on)?$|^(?:time to|lets) (focus|study|play|game|chill|relax|sleep)$/.exec(t);
    if (m && !/^(dark|night|light|day|heavenly|heaven|traced|airplane|sleep timer)$/.test(m[1] || m[2] || '')) return r('mode', { name: (m[1] || m[2] || m[3]).replace(/^study$/, 'school').replace(/^(game)$/, 'play').replace(/^relax$/, 'chill').trim() });
    if (/^(how many ads (did you|have you) block(ed)?( today)?|ads blocked( today)?|shield status|how is shield( doing)?)$/.test(t)) return r('shield', { act: 'count' });
    m = /^(?:turn |switch )?(on|off) (?:the )?(?:ad ?blocker|shield|ad blocking)$|^(?:turn |switch )?(?:the )?(?:ad ?blocker|shield|ad blocking) (on|off)$|^(block ads|stop ads|no more ads)$/.exec(t);
    if (m) return r('shield', { act: m[3] ? 'on' : (m[1] || m[2]) });
    m = /^(?:pause|stop) (?:the )?(?:ad ?blocker|shield|blocking ads) (?:on |for )(?:this (?:site|page|website))$|^(?:allow ads|let ads through) (?:on |for )?this (?:site|page|website)$/.exec(t);
    if (m) return r('shield', { act: 'pause' });
    if (/^(take a |grab a |make a )?(screenshot|screen shot|screen grab|picture of the screen)$/.test(t)) return r('shot');
    if (/^(how was my week|my week|your week|show (me )?my week|weekly recap|recap|screen time|how much time did i spend( on the computer)?( this week)?)$/.test(t)) return r('week');
    if (/^(restart|reload) (the )?desktop$/.test(t)) return r('power', { act: 'restart-desktop' });
    if (/^lock( the)?( screen| computer)?$/.test(t)) return r('lock');

    // ---- the web: a site, a search, or a question to look up ----
    m = /^(?:open|go to|visit|take me to|show me|bring up|pull up|load)? ?((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)$/.exec(String(said || '').toLowerCase().trim().replace(/^(hey |ok )?deuce,? ?/, '').replace(/[?!.]+$/, ''));
    if (m && /\.[a-z]{2,}(\/|$)/.test(m[1]) && !/^\d+(\.\d+)+$/.test(m[1])) return r('site', { url: /^https?:/.test(m[1]) ? m[1] : 'https://' + m[1] });
    m = /^(?:search the web for|search online for|search the internet for|google|bing|web search|look up online|search for) (.+)$/.exec(t);
    if (m && !/ on (youtube|netflix|spotify|hulu|disney|prime|twitch)( app)?$/.test(m[1])) return r('web', { q: m[1] });

    // the TV and Dice: on and off
    if (/^(turn|switch|power) (off|it off|the tv off|off the tv|dice off|off dice|everything off)( the tv| dice)?$|^(go to sleep|good ?night|sleep|power off|tv off|shut it off)$/.test(t)) return r('power', { act: 'standby' });
    if (/^(shut down|restart|reboot)( the (computer|pi|raspberry pi|dice))?$/.test(t)) return r('power', { act: /shut/.test(t) ? 'shutdown' : 'reboot' });
    if (/^(picture off|screen off|turn (off )?the (picture|screen)( off)?)$/.test(t)) return r('picture');

    // sound
    if (/^(un ?mute|sound on|turn the sound (back )?on)( it| the tv| the sound)?$/.test(t)) return r('volume', { mute: false });
    if (/^(mute|silence|sound off|be quiet|quiet)( it| the tv| the sound| everything)?$/.test(t)) return r('volume', { mute: true });
    m = new RegExp('^(?:set |turn |change )?(?:the )?volume (?:to |at )?(' + NUMWORD + ')(?: percent)?$').exec(t);
    if (m && !isNaN(number(m[1]))) { const n = number(m[1]); return r('volume', { level: Math.max(0, Math.min(1, n > 10 ? n / 100 : n / 10)) }); }
    if (/^(volume up|turn (it |the volume |the sound |the tv )?up|louder|(make it |a bit |little )*louder|raise the volume|increase the volume|i cant hear)/.test(t)) return r('volume', { delta: /a lot|way|much/.test(t) ? 0.2 : 0.1 });
    if (/^(volume down|turn (it |the volume |the sound |the tv )?down|quieter|softer|(make it |a bit |little )*(quieter|softer)|lower the volume|decrease the volume|too loud)/.test(t)) return r('volume', { delta: /a lot|way|much/.test(t) ? -0.2 : -0.1 });

    // playing
    if (/^(pause|pause (it|this|the music|music|the song|the video)|hold on|wait)$/.test(t)) return r('media', { act: 'pause' });
    if (/^(resume|unpause|keep playing|continue|play|play it|play again)$/.test(t)) return r('media', { act: 'play' });
    if (/^(next|skip|next (song|track|one|channel)|skip (this|it|this song))$/.test(t)) return r('media', { act: 'next' });
    if (/^(previous|last|go back a song|previous (song|track|channel)|last (song|channel))$/.test(t)) return r('media', { act: 'prev' });
    if (/^(stop|stop (it|the music|music|playing))$/.test(t)) return r('media', { act: 'stop' });

    // timers and alarms
    m = new RegExp('^(?:set |start |make )?(?:a |an )?(?:(' + NUMWORD + ')(?: and a half| and half)? (second|sec|minute|min|hour|hr)s? timer|timer (?:for |of )?(' + NUMWORD + ')(?: and a half| and half)? ?(second|sec|minute|min|hour|hr)?s?(?: and (?:a )?half)?)(?: (?:timer|please))?$').exec(t);
    if (!m) { const hl = /^(?:set |start )?(?:a )?timer (?:for )?half an hour$|^half an hour timer$/.test(t); if (hl) return r('timer', { ms: 30 * 60000 }); }
    if (m) {
      const n = number(m[1] || m[3]) + (/and (a )?half/.test(t) ? 0.5 : 0), u = (m[2] || m[4] || 'minute')[0];
      const ms = Math.round(n * (u === 's' ? 1000 : u === 'h' ? 3600000 : 60000));
      if (ms > 0 && ms <= 24 * 3600000) return r('timer', { ms });
    }
    if (/^(cancel|stop|turn off|clear) (the )?timer$/.test(t)) return r('timer', { ms: 0 });
    m = new RegExp('^(?:turn (?:it |the tv |dice )?off|go to sleep|sleep|sleep timer|set a sleep timer|set the sleep timer|turn off the tv)(?: for)? in (' + NUMWORD + ') (minute|min|hour|hr)s?$|^sleep timer (?:for )?(' + NUMWORD + ') (minute|min|hour|hr)s?$').exec(t);
    if (m) { const n = number(m[1] || m[3]), u = (m[2] || m[4])[0]; return r('sleep', { mins: Math.round(n * (u === 'h' ? 60 : 1)) }); }
    m = /^(?:set |make )?(?:an |the |my )?alarm (?:for |at )?(.+?)(?: (every day|daily|weekdays|on weekdays|weekends|tomorrow))?$|^wake me( up)? (?:at |up at )?(.+?)(?: (every day|daily|weekdays|on weekdays|weekends|tomorrow))?$/.exec(t);
    if (m && !/^(alarms?|clock)$/.test(t)) {
      const at = clock(m[1] || m[4]), when = m[2] || m[5] || '';
      if (at) return r('alarm', { time: at, days: /every day|daily/.test(when) ? [0, 1, 2, 3, 4, 5, 6] : /weekday/.test(when) ? [1, 2, 3, 4, 5] : /weekend/.test(when) ? [0, 6] : [] });
    }

    // questions
    if (/^(what time is it|whats the time|what is the time|time|the time|tell me the time|what time)( now| is it now)?$/.test(t)) return r('time');
    if (/^(whats|what is) (the date|todays date|the day|today)|^what day is (it|today)|^(the )?date$/.test(t)) return r('date');
    if (/weather|forecast|temperature|how (hot|cold|warm) is it|is it (going to |gonna )?(rain|snow|cold|hot|warm|sunny)|do i need (an umbrella|a coat|a jacket)/.test(t)) return r('weather', { tomorrow: /tomorrow/.test(t) });

    // HDMI: the other things plugged into the TV
    if (/^(how (do|can) i )?(set up|setup|use|learn) (the )?(inputs|kvm|kvm switch|hdmi switching|deskflow)( step by step)?$|^(inputs|kvm) (guide|tutorial|help)$|^(help|show me how) (with|to set up) (the )?(inputs|kvm)$/.test(t)) return r('guide');
    if (/^(switch|change|go to|show|show me|open|list)( the)? (inputs?|hdmi inputs?|sources?|devices)$|^(change|switch) (the )?(input|source)$/.test(t)) return r('inputs');
    m = new RegExp('^(?:switch|change|go|turn|flip|put it)(?: the (?:input|tv|source|screen|monitor))?(?: over)? (?:to|on) (?:the |my )?(' + DEVICES + '|hdmi ?(\\d)|input ?(\\d)|hdmi (one|two|three|four))$|^(?:play|turn on|open|use) (?:the |my )?(' + DEVICES + ')$').exec(t);
    if (m) {
      const port = m[2] || m[3] || (m[4] ? number(m[4]) : 0);
      return r('input', port ? { port: +port, name: 'HDMI ' + port } : { name: (m[1] || m[5]).replace(/^the /, '') });
    }
    if (/^(dice|back to dice|switch (back )?to dice|go back to dice|diceos|dice os)$/.test(t)) return r('input', { name: 'dice', dice: true });
    m = /^(?:switch|change|go|flip|turn|put)(?: the (?:input|tv|screen|monitor|source))?(?: over)? (?:to|on) (?:the |my )?(.+)$/.exec(t);
    if (m && (ctx.inputs || []).some((n) => clean(n) === m[1])) return r('input', { name: m[1] });

    // a game: "put on the knicks game", "where can i watch the jets", "whats the score of the rangers game"
    const teams = teamsIn(t);
    const gamey = /\b(game|games|match|matchup|score|scores|playing|play tonight|play today|vs|versus|against|kickoff|tip off|puck drop|first pitch|won|win|lose|lost|winning|losing)\b/.test(t) || /^(when|what time|do|does|did|are|is) .*\bplay\b/.test(t);
    const watchy = /^(put on|watch|turn on|show|show me|find|get|open|where can i watch|how (do|can) i watch|where is|wheres|whats on with) (the |a )?/.test(t);
    if (teams.length && (gamey || (watchy && teams.some((tm) => has(t, 'the ' + tm.names[0]) || has(t, tm.names[0]))))) {
      const nick = teams.filter((tm) => tm.names.some((n) => has(t, n)));
      const pool = inSeason(nick.length ? nick : teams, now.getMonth() + 1);
      const want = /score|winning|losing|who won|did (the )?.+ (win|lose)|whos winning|how are (the )?.+ doing/.test(t) ? 'score'
        : /^(when|what time) |is there (a |an )?.+ game|do (the )?.+ play|are (the )?.+ playing/.test(t) ? 'when' : 'watch';
      return r('game', { teams: pool.map((tm) => ({ league: tm.league, sport: tm.sport, nick: tm.nick, full: tm.full })), want });
    }

    // a channel: "put on msg", "watch nbc", "channel 7"
    m = /^(?:put on|watch|turn on|go to|switch to|change to|tune to|show me|open)? ?(?:channel )?(\d{1,3}(?:\.\d{1,2})?)$|^channel (\w+)$/.exec(t);
    if (m) { const n = m[1] || (isNaN(number(m[2])) ? '' : String(number(m[2]))); if (n) return r('channel', { num: n }); }
    m = /^(?:put on|watch|turn on|go to|switch to|change to|tune to|change the channel to|show me|open)? ?(?:the )?(.+?)(?: channel| network| live)?$/.exec(t);
    if (m) {
      // only a channel when it's just its name ("msg", "the nbc channel"), not "the nbc app"
      const net = netExactly(clean(m[1]));
      if (['msg', 'msgsn', 'yes', 'sny', 'espn', 'abc', 'nbc', 'cbs', 'fox', 'fs1', 'pbs', 'tnt', 'nbatv', 'nfln', 'mlbn', 'nhln', 'fdsn', 'nesn', 'usa', 'cnbc'].includes(net)) return r('channel', { id: net });
    }

    // "play stranger things on netflix", "search youtube for lofi", "find cats on youtube"
    m = /^(?:play|watch|put on|find|search for|search|look up|show me|show) (.+?) on (?:the )?(.+?)(?: app)?$/.exec(t) || /^(?:search|look up|find|search on) (?:the )?(.+?) for (.+)$/.exec(t);
    if (m) {
      const swap = /^(?:search|look up|find|search on) (?:the )?(.+?) for /.test(t) && !/ on /.test(t);
      const q = swap ? m[2] : m[1], where = appOf(swap ? m[1] : m[2]);
      if (where && q) return r('search', { app: where, q });
    }

    // an app: "open netflix", "netflix", "go to youtube"
    m = /^(?:open|launch|start|go to|put on|watch|show me|show|switch to|take me to|bring up|pull up|turn on)? ?(.+)$/.exec(t);
    if (m) { const a = appOf(m[1]); if (a) return r('app', { id: a }); }

    // music
    if (/^(play )?(some )?(music|songs|tunes|dice radio|the radio|radio|something (calm|relaxing|chill))$/.test(t)) return r('music');
    m = /^(?:play|put on|listen to) (?:some |the )?(.+?)(?: music| songs| playlist)?$/.exec(t);
    if (m) return r('search', { app: 'youtube', q: m[1], play: true });

    // photos and files
    if (/^(show|open|see)( me)?( my)? (photos|pictures|pics)( from .+)?$/.test(t)) return r('app', { id: 'dice:photos' });
    m = /^(?:find|search|look for|where is|wheres|open) (?:my |the )?(.+?)(?: file| files| document| doc)?$/.exec(t);
    if (m && /\b(file|files|document|doc|pdf|essay|photo|picture|song|video|my)\b/.test(t)) return r('files', { q: m[1].replace(/^(my|the) /, '') });

    // a question Deuce can look up on the web ("why is the sky blue", "who wrote hamlet")
    if (/^(who|what|whats|when|where|wheres|why|how|hows|which|whose|is|are|was|were|do|does|did|can|could|should|will|would|explain|tell me|define|whats the difference)\b/.test(t) || /\?\s*$/.test(String(said || ''))) return r('ask', { q: String(said || '').replace(/^\s*(hey |ok )?deuce,? ?/i, '').trim() || t });
    return r('unknown', { q: t });
  }

  // "remind me to call mom at 6", "remind me in 20 minutes to check the oven", "remind me tomorrow at 9 to take out the trash"
  // → { what, at } (at: the time, in milliseconds; null if you didn't say when)
  function reminder(t, now) {
    let s = t.replace(/^(remind me|set a reminder|make a reminder|add a reminder|reminder)( to| about| that| for)?\b ?/, ' ').replace(/\s+/g, ' ');
    let at = null, day = 0, hm = null, m;
    m = new RegExp('\\bin (' + NUMWORD + '|a|an|half an?)(?: and a half)? (second|sec|minute|min|hour|hr|day)s?\\b').exec(s);
    if (m) {
      const n = /half/.test(m[1]) ? 0.5 : number(m[1]) + (/and a half/.test(m[0]) ? 0.5 : 0), u = m[2][0];
      if (!isNaN(n)) at = now.getTime() + Math.round(n * (u === 's' ? 1000 : u === 'h' ? 3600000 : u === 'd' ? 86400000 : 60000));
      s = s.replace(m[0], ' ');
    }
    if (/\btomorrow\b/.test(s)) { day = 1; s = s.replace(/\b(tomorrow (morning|afternoon|evening|night)|tomorrow)\b/, (w) => { if (/morning/.test(w)) hm = hm || '09:00'; if (/afternoon/.test(w)) hm = hm || '14:00'; if (/evening|night/.test(w)) hm = hm || '19:00'; return ' '; }); }
    if (/\b(tonight|this evening)\b/.test(s)) { hm = '20:00'; s = s.replace(/\b(tonight|this evening)\b/, ' '); }
    if (/\bthis afternoon\b/.test(s)) { hm = '15:00'; s = s.replace(/\bthis afternoon\b/, ' '); }
    if (/\bthis morning\b/.test(s)) { hm = '09:00'; s = s.replace(/\bthis morning\b/, ' '); }
    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    m = /\b(?:on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(s);
    if (m) { day = ((DAYS.indexOf(m[1]) - now.getDay() + 7) % 7) || 7; s = s.replace(m[0], ' '); }
    m = /\b(?:at|by|around) ((?:\d{1,2}(?::\d{2})?|[a-z]+(?: [a-z]+)?)(?: ?(?:am|pm|a m|p m))?|noon|midnight)\b/.exec(s);
    let bare = false;
    if (m) {
      const c = clock(m[1]);
      if (c) { hm = c; bare = !/am|pm|a m|p m|noon|midnight/.test(m[1]) && +c.slice(0, 2) < 12; s = s.replace(m[0], ' '); }
    }
    if (at === null && (hm || day)) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hm ? +hm.slice(0, 2) : 9, hm ? +hm.slice(3) : 0);
      // "at 6" means the next 6 to come: this evening if this morning's has gone
      if (bare && !day && d.getTime() <= now.getTime()) d.setHours(d.getHours() + 12);
      if (!day && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      at = d.getTime();
    }
    const what = s.replace(/\s+/g, ' ').trim().replace(/^(to|that|about|for) /, '').replace(/ (to|at|on|in)$/, '').trim();
    return { what, at };
  }

  // "7", "7 am", "7:30 pm", "seven thirty", "6 in the morning", "noon"
  function clock(s) {
    let t = clean(s).replace(/ (in the )?morning$/, ' am').replace(/ (in the )?(evening|afternoon|at night|tonight)$/, ' pm').replace(/o clock/, '').replace(/\ba m\b/, 'am').replace(/\bp m\b/, 'pm').replace(/\s+/g, ' ').trim();
    if (t === 'noon' || t === 'midday') return '12:00';
    if (t === 'midnight') return '00:00';
    let m = /^(\d{1,2})(?::(\d{2}))? ?(am|pm)?$/.exec(t), hh, mm, ap;
    if (m) { hh = +m[1]; mm = +(m[2] || 0); ap = m[3]; } else {
      const half = / ?(am|pm)$/.exec(t);
      if (half) { ap = half[1]; t = t.slice(0, half.index); }
      m = /^([a-z]+)(?: ([a-z]+(?: [a-z]+)?))?$/.exec(t);
      if (!m) return null;
      hh = number(m[1]); mm = m[2] ? number(m[2].replace(/^oh /, '')) : 0;
      if (isNaN(hh) || isNaN(mm)) return null;
    }
    if (hh > 23 || mm > 59) return null;
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    // no am or pm: an alarm's probably in the morning, unless it's past noon already in hours
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  // ---- a game, from ESPN's scoreboard (site.api.espn.com) --------------------------------------
  const ymd = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  function scoreboardUrl(team, now) {
    now = now || new Date();
    const from = new Date(now.getTime() - 864e5), to = new Date(now.getTime() + 7 * 864e5);
    return 'https://site.api.espn.com/apis/site/v2/sports/' + team.sport + '/' + team.league + '/scoreboard?dates=' + ymd(from) + '-' + ymd(to) + '&limit=200';
  }
  const lower = (s) => String(s || '').toLowerCase();
  function sideOf(ev, team) {
    const comp = (ev.competitions || [])[0] || {};
    const cs = comp.competitors || [];
    const me = cs.find((c) => { const tm = c.team || {}; return lower(tm.name) === lower(team.nick) || lower(tm.displayName) === lower(team.full) || lower(tm.shortDisplayName) === lower(team.nick) || (lower(tm.displayName).endsWith(' ' + lower(team.nick))); });
    if (!me) return null;
    return { comp, me, them: cs.find((c) => c !== me) || {} };
  }
  // the game to show: one that's on now, else the next one, else the last one
  function pickGame(events, team, now) {
    now = now || new Date();
    const mine = (events || []).map((ev) => ({ ev, s: sideOf(ev, team) })).filter((x) => x.s);
    if (!mine.length) return null;
    const state = (x) => (((x.ev.status || {}).type || {}).state) || 'pre';
    const at = (x) => new Date(x.ev.date || 0).getTime();
    const live = mine.find((x) => state(x) === 'in');
    if (live) return game(live, team);
    const next = mine.filter((x) => state(x) === 'pre' && at(x) > now - 4 * 3600e3).sort((a, b) => at(a) - at(b))[0];
    const last = mine.filter((x) => state(x) === 'post').sort((a, b) => at(b) - at(a))[0];
    // just finished (in the last 3 hours) beats one days away
    if (last && (!next || (now - at(last) < 3 * 3600e3 && at(next) - now > 12 * 3600e3))) return game(last, team);
    return next ? game(next, team) : last ? game(last, team) : null;
  }
  function game(x, team) {
    const { ev, s } = x, st = (ev.status || {}).type || {};
    const name = (c) => ((c.team || {}).shortDisplayName || (c.team || {}).name || (c.team || {}).displayName || '');
    return { id: ev.id, league: team.league, team: team.nick, at: ev.date, state: st.state || 'pre', detail: st.shortDetail || st.detail || '', home: s.me.homeAway === 'home',
      us: name(s.me), them: name(s.them), usScore: s.me.score, themScore: s.them.score, title: ev.name || ev.shortName || '', networks: broadcasts(s.comp, s.me.homeAway === 'home' ? 'home' : 'away') };
  }
  // the networks showing it, the national ones first, then the one for our side (the home team's
  // local channel, like MSG for the Knicks)
  function broadcasts(comp, side) {
    const out = [], add = (n, where) => { n = String(n || '').trim(); if (n && !out.some((o) => o.name === n)) out.push({ name: n, where, id: netOf(n) }); };
    const where = (m) => { m = lower(typeof m === 'object' && m ? (m.type || m.name) : m); return m.startsWith('nat') ? 'national' : m.startsWith('home') ? 'home' : m.startsWith('away') ? 'away' : m || 'national'; };
    const list = [];
    (comp.broadcasts || []).forEach((b) => (b.names || [b.name || b.shortName]).forEach((n) => list.push([n, where(b.market)])));
    (comp.geoBroadcasts || []).forEach((g) => { const ty = lower(((g.type || {}).shortName) || 'tv'); if (ty === 'tv' || ty === 'streaming' || ty === 'web') list.push([(g.media || {}).shortName || (g.media || {}).name, where(g.market)]); });
    list.filter((x) => x[1] === 'national').forEach((x) => add(x[0], 'national'));
    list.filter((x) => x[1] === side).forEach((x) => add(x[0], side));
    list.filter((x) => x[1] !== 'national' && x[1] !== side).forEach((x) => add(x[0], x[1]));
    return out;
  }

  // ---- other places' time: "what time is it in tokyo" --------------------------------------------------------
  const ZONES = ('new york,nyc,manhattan,brooklyn,boston,miami,atlanta,washington,dc,philadelphia,new jersey,toronto,montreal|America/New_York;' +
    'chicago,dallas,houston,austin,mexico city,minneapolis,new orleans,nashville|America/Chicago;denver,salt lake city,phoenix|America/Denver;' +
    'los angeles,la,san francisco,seattle,las vegas,vancouver,san diego,portland|America/Los_Angeles;anchorage,alaska|America/Anchorage;honolulu,hawaii|Pacific/Honolulu;' +
    'sao paulo,rio,rio de janeiro,brazil|America/Sao_Paulo;buenos aires,argentina|America/Argentina/Buenos_Aires;lima,peru|America/Lima;bogota,colombia|America/Bogota;' +
    'london,uk,england,britain,dublin,ireland,lisbon,portugal|Europe/London;paris,france,berlin,germany,madrid,spain,rome,italy,amsterdam,brussels,vienna,zurich,stockholm,oslo,copenhagen,prague,warsaw|Europe/Paris;' +
    'athens,greece,istanbul,turkey,cairo,egypt,helsinki,kyiv,ukraine,jerusalem,israel|Europe/Athens;moscow,russia|Europe/Moscow;dubai,abu dhabi|Asia/Dubai;' +
    'mumbai,delhi,new delhi,bangalore,bengaluru,india,kolkata,chennai,hyderabad|Asia/Kolkata;karachi,pakistan|Asia/Karachi;dhaka,bangladesh|Asia/Dhaka;' +
    'bangkok,thailand,jakarta,vietnam,hanoi|Asia/Bangkok;singapore,kuala lumpur,malaysia,manila,philippines,hong kong,beijing,shanghai,china,taipei,taiwan,perth|Asia/Singapore;' +
    'tokyo,japan,osaka,seoul,korea,south korea|Asia/Tokyo;sydney,melbourne,australia,canberra|Australia/Sydney;brisbane|Australia/Brisbane;auckland,new zealand|Pacific/Auckland;' +
    'johannesburg,south africa,cape town|Africa/Johannesburg;lagos,nigeria|Africa/Lagos;nairobi,kenya|Africa/Nairobi;reykjavik,iceland|Atlantic/Reykjavik').split(';').map((x) => { const [n, z] = x.split('|'); return [n.split(','), z]; });
  function zoneOf(place) {
    const p = clean(place).replace(/^the /, '');
    for (const [names, z] of ZONES) if (names.includes(p)) return [p.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Uk|La|Dc|Nyc)\b/g, (s) => s.toUpperCase()), z];
    return null;
  }

  // ---- how long until: "christmas", "june 18", "friday", "new years", "thanksgiving" -------------------------------
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function untilOf(what, now) {
    const t = clean(what).replace(/^(the |my )/, ''), y = now.getFullYear();
    const next = (mo, d) => { let x = new Date(y, mo, d); if (x < new Date(y, now.getMonth(), now.getDate())) x = new Date(y + 1, mo, d); return x; };
    const nthDow = (yy, mo, dow, n) => { const d = new Date(yy, mo, 1); const first = (dow - d.getDay() + 7) % 7; return new Date(yy, mo, 1 + first + (n - 1) * 7); };
    const easter = (yy) => { const a = yy % 19, b = Math.floor(yy / 100), c = yy % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), dd = ((h + l - 7 * m + 114) % 31) + 1; return new Date(yy, mo - 1, dd); };
    const yearly = (fn) => { let x = fn(y); if (x < new Date(y, now.getMonth(), now.getDate())) x = fn(y + 1); return x; };
    const DAYS = { christmas: () => next(11, 25), 'christmas eve': () => next(11, 24), 'new year': () => next(0, 1), 'new years': () => next(0, 1), 'new years day': () => next(0, 1), 'new years eve': () => next(11, 31),
      halloween: () => next(9, 31), valentines: () => next(1, 14), 'valentines day': () => next(1, 14), 'july 4th': () => next(6, 4), 'fourth of july': () => next(6, 4), 'independence day': () => next(6, 4),
      thanksgiving: () => yearly((yy) => nthDow(yy, 10, 4, 4)), easter: () => yearly(easter), 'mothers day': () => yearly((yy) => nthDow(yy, 4, 0, 2)), 'fathers day': () => yearly((yy) => nthDow(yy, 5, 0, 3)),
      summer: () => next(5, 21), winter: () => next(11, 21), spring: () => next(2, 20), fall: () => next(8, 22), autumn: () => next(8, 22), 'the weekend': () => null, weekend: () => null };
    let at = null, name = what.trim();
    if (DAYS[t] !== undefined) {
      at = DAYS[t]();
      if (!at) { const d = new Date(now); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); at = new Date(d.getFullYear(), d.getMonth(), d.getDate()); name = 'the weekend'; }
    }
    let m;
    if (!at && (m = new RegExp('^(' + MONTHS.join('|') + '|' + MONTHS.map((x) => x.slice(0, 3)).join('|') + ') (\\d{1,2})(?:st|nd|rd|th)?(?: (\\d{4}))?$').exec(t))) {
      const mo = MONTHS.findIndex((x) => x.startsWith(m[1].slice(0, 3)));
      at = m[3] ? new Date(+m[3], mo, +m[2]) : next(mo, +m[2]);
    }
    if (!at && (m = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/.exec(t))) {
      const mo = MONTHS.findIndex((x) => x.startsWith(m[2].slice(0, 3)));
      if (mo >= 0) at = m[3] ? new Date(+m[3], mo, +m[1]) : next(mo, +m[1]);
    }
    const wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(t.replace(/^next /, ''));
    if (!at && wd >= 0) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7 || 7)); at = d; }
    if (!at) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { what: name, at: at.getTime(), days: Math.round((at - today) / 864e5) };
  }

  // ---- two things at once: "turn on dark mode and play some music" --------------------------------------------------
  function split(said, now, ctx) {
    const parts = String(said || '').split(/\s*(?:,\s*)?(?:\band then\b|\bthen\b|\band also\b|\band\b|;)\s*/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 4) return null;
    const its = parts.map((p) => understand(p, now, ctx));
    return its.every((x) => !['unknown', 'ask', 'none', 'web', 'help', 'cancel'].includes(x.kind)) ? its : null;
  }

  const api = { understand, split, reminder, untilOf, zoneOf, teamsIn, netOf, number, clock, scoreboardUrl, pickGame, broadcasts, clean, LEAGUES, TEAMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DeuceBrain = api;
})(this);
