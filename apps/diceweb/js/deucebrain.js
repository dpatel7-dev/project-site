// Deuce's brain: working out what was said. "Put on the Knicks game", "open Netflix",
// "switch to the PlayStation", "timer for ten minutes". Plain JavaScript with no screen,
// so Node tests it too. No cloud AI: what you say stays on the TV.
// In the browser it becomes window.DeuceBrain; in Node, require('./js/deucebrain.js').
(function (root) {
  'use strict';

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

    // the TV and Dice: on and off
    if (/^(turn|switch|power) (off|it off|the tv off|off the tv|dice off|off dice|everything off)( the tv| dice)?$|^(go to sleep|good ?night|sleep|power off|tv off|shut it off)$/.test(t)) return r('power', { act: 'standby' });
    if (/^(shut down|restart|reboot)( the (computer|pi|raspberry pi|dice))?$/.test(t)) return r('power', { act: /shut/.test(t) ? 'shutdown' : 'reboot' });
    if (/^(picture off|screen off|turn (off )?the (picture|screen)( off)?)$/.test(t)) return r('picture');

    // sound
    if (/^(un ?mute|sound on|turn the sound (back )?on)( it| the tv| the sound)?$/.test(t)) return r('volume', { mute: false });
    if (/^(mute|silence|sound off|be quiet|quiet)( it| the tv| the sound| everything)?$/.test(t)) return r('volume', { mute: true });
    let m = new RegExp('^(?:set |turn |change )?(?:the )?volume (?:to |at )?(' + NUMWORD + ')(?: percent)?$').exec(t);
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

    return r('unknown', { q: t });
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

  const api = { understand, teamsIn, netOf, number, clock, scoreboardUrl, pickGame, broadcasts, clean, LEAGUES, TEAMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DeuceBrain = api;
})(this);
