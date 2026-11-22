# Changelog

## 1.1.0
- **locket in Chrome**: a Chrome extension. Click a username or password box on a website and your saved logins drop down (like Chrome's own). On sign-up pages it fills in a strong password. After you sign in or up, it asks **Save this password in locket?** (or **Update**). It only talks to locket on this computer, only fills on https pages, and only for the website each login was saved for. Set it up from **locket in Chrome**, or `locket chrome`.
- **Accounts**: your logins sorted by the email (or username) you signed up with, with what needs fixing for each one.
- A new side menu: every section has its own colour from the yellow-to-red stripes, with pixel icons, a big **Add a password** button at the top, and **Lock** at the bottom. The other pages match it.
- The armadillo is now called **Bastion**.
- **Light or dark, set once for every app:** press **L** in pca (or `pca look light`, `pca look dark`, `pca look auto`). The side panel follows it too.

## 1.0.0
- locket keeps your passwords, locked with one master password (scrypt, then AES-256-GCM). The master password is never saved.
- Logins and notes. Copy a username or password with one click; copied passwords are marked secret (clipboard keepers skip them) and clear themselves after 30 seconds.
- Make a password: random characters, or words that are easy to type.
- 2-step codes: paste a website's 2-step key and locket shows the codes.
- Check-up: passwords that are leaked (Have I Been Pwned, sending only 5 characters of a fingerprint), used more than once, or easy to guess.
- Bring passwords in from Chrome, Safari, Firefox, Edge, Bitwarden (CSV or JSON), 1Password and LastPass, with step-by-step instructions. Take them out again as a CSV.
- Unlock with Touch ID (Apple's own check; a photo can't fool it), or your Mac's password on Macs without Touch ID.
- Locks itself after 15 quiet minutes. Recently deleted, for second thoughts. Old passwords kept with each login.
- A side panel from the menu bar armadillo (or ⌃⌥L) for quick copying. `locket get`, `locket make` in Terminal.
- A desert along the bottom: mesas striped yellow to red, cacti, a tumbleweed. Dilly the armadillo walks about while it's unlocked and curls into a ball when it locks.
