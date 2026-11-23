# Changelog

## 1.2.0
- **A small hum:** press **M** (or the arrows button) and hum becomes a little player tucked in the bottom right corner of the screen: the song, play/pause/next, Bumble's bar and the garden. Press **M** again to make it big. It remembers which you like. `hum small` and `hum big` work too. While a YouTube song plays, the small player grows just enough to show the video, because YouTube's rules say its player must be at least 200 × 200 pixels. (The full panel's video is that size now too.)
- **The flowers dance to your music.** hum listens for the beat in your own music files: the flowers rock from side to side on the beat (further when the music is busy), some bob, some hop and some open their petals, and they pick new moves when the song or its pace changes. High notes send up little sparkles, and a big drop makes them all jump and throw their petals. Bumble bobs on the beat too. (YouTube's player keeps its sound to itself, so for YouTube songs the flowers keep their own easy time.)
- When the music stops the flowers droop and doze off, and they wake up one by one when it starts again. At the end of a song they take a bow, and liking a song floats a heart up from the garden. At night their glow brightens on the beat.
- After an update, the side panel swaps in its newer program by itself.

## 1.1.0
- **Adding YouTube links works with any link you paste**: with or without `https://`, from the address bar, Share, Shorts or YouTube Music. (The box used to refuse links without `https://` and say nothing.)
- If hum can't reach YouTube from your network to look up a song's name, the song is still added and gets its real name the first time it plays.
- **Choose files… and Choose a folder… open the Mac's own file box**, so they work in the side panel too (they did nothing there before). Your songs play from where they are.
- Dropped music files are sent as they are, so big files work.
- If hum's background part has stopped, it says so plainly ("type: hum on") instead of "Failed to fetch", and carries on when it's back.
- `hum doctor` checks whether YouTube can be reached from your network.
- **Light or dark, set once for every app:** press **L** in pca (or `pca look light`, `pca look dark`, `pca look auto`). The side panel follows it too.

## 1.0.0
- hum plays your music from a little panel at the side of the screen, of Apple's frosted glass. It floats over what you're doing without taking it over. A bee in the menu bar (and ⌃⌥M) opens and closes it.
- Your own music files: mp3, m4a, wav, aiff and flac, with their names, artists, albums and cover pictures. Find music on this Mac, choose files, drop files on the panel, or `hum add ~/Music`.
- Songs from YouTube play in YouTube's own player in the panel (never downloaded).
- Playlists (drag to put them in order), Up next, Liked, shuffle, repeat, a sleep timer, and bass, middle and treble.
- `hum` in Terminal shows what's playing with keys to control it; `hum play`, `pause`, `next`, `now`.
- Bumble the bumblebee flies along the bar as the song plays, and a garden along the bottom sways to the music. Bright flowers and a butterfly by day; glowing flowers, stars and a moth by night.
