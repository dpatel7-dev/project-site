#!/usr/bin/env bash
# DiceOS for a Raspberry Pi (64-bit Raspberry Pi OS) or a PC (64-bit Debian or Ubuntu).
#
# On a Pi that already runs Raspberry Pi OS, or a PC that runs Debian or Ubuntu:
#   curl -fsSL https://djp7.pythonanywhere.com/dice/install.sh | sudo bash
# With your settings from the website (the setup code it gave you):
#   curl -fsSL https://djp7.pythonanywhere.com/dice/install.sh | sudo bash -s -- K7Q2XM
#
# The DiceOS images are built with this same script (image/build.sh for the Pi,
# image/build-pc.sh for PCs).
# To take DiceOS off again:  sudo /opt/dice/bin/dice-uninstall
set -euo pipefail

SITE="${DICE_SITE:-https://djp7.pythonanywhere.com}"
CODE="${1:-}"
IMAGE="${DICE_IMAGE:-}"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "DiceOS needs to be installed with sudo:  curl -fsSL $SITE/dice/install.sh | sudo bash"
[ -f /etc/os-release ] && . /etc/os-release
case " ${ID:-} ${ID_LIKE:-} " in *debian*|*raspbian*|*ubuntu*) ;; *) fail "DiceOS needs Raspberry Pi OS, Debian or Ubuntu.";; esac
if [ -n "$CODE" ] && ! printf '%s' "$CODE" | grep -Eq '^[A-Za-z0-9]{4,12}$'; then fail "That setup code doesn't look right: $CODE"; fi
ARCH=$(dpkg --print-architecture)
case "$ARCH" in arm64|amd64) ;; *) say "Note: DiceOS is made for 64-bit computers (arm64 or amd64). This is $ARCH, so it may not work.";; esac

# a Raspberry Pi, or a PC?
# (DICE_IMAGE=pi or pc says so when building an image, where the build machine is neither)
PI=0
if grep -qi 'raspberry pi' /proc/device-tree/model 2>/dev/null || [ -f /boot/firmware/config.txt ]; then PI=1; fi
case "$IMAGE" in pi) PI=1;; pc) PI=0;; esac
BOOT=/boot/firmware; [ -d "$BOOT" ] || BOOT=/boot
# where the settings from the website go: the Pi's card, or DiceOS's own folder on a PC
if [ "$PI" = 1 ]; then SETTINGS_FILE="$BOOT/dice.json"; THIS="the Pi"; else SETTINGS_FILE=/etc/dice/dice.json; THIS="the computer"; fi

say "1 of 5: Getting what DiceOS needs. This takes a while..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
CHROME=chromium
apt-cache show chromium >/dev/null 2>&1 || CHROME=chromium-browser
PKGS="cage $CHROME python3 curl ca-certificates plymouth plymouth-themes wlr-randr pipewire pipewire-pulse wireplumber fonts-noto-color-emoji network-manager rfkill iw alsa-utils bluez grim"
# a PC also wants the drivers for its graphics, and a sound card's firmware where Debian has them
if [ "$PI" = 0 ]; then
  for p in libgl1-mesa-dri mesa-vulkan-drivers firmware-linux-free firmware-sof-signed; do apt-cache show "$p" >/dev/null 2>&1 && PKGS="$PKGS $p"; done
fi
# shellcheck disable=SC2086
apt-get install -y --no-install-recommends $PKGS

say "2 of 5: Putting DiceOS in /opt/dice..."
if [ -n "${DICE_SRC:-}" ]; then
  SRC="$DICE_SRC"
else
  TMP=$(mktemp -d)
  curl -fsSL "$SITE/dice/dice.tar.gz" | tar -xz -C "$TMP"
  SRC="$TMP/dice"
fi
[ -f "$SRC/daemon/diced.py" ] || fail "The DiceOS download wasn't right. Nothing was changed."
rm -rf /opt/dice.new
cp -r "$SRC" /opt/dice.new
rm -rf /opt/dice.new/.git /opt/dice.new/dist
if [ -d /opt/dice ]; then rm -rf /opt/dice.old; mv /opt/dice /opt/dice.old; fi
mv /opt/dice.new /opt/dice
chmod +x /opt/dice/bin/*
mkdir -p /etc/dice /var/lib/dice
[ -f /etc/dice/settings.json ] || echo '{}' > /etc/dice/settings.json

say "3 of 5: Setting DiceOS to start with $THIS..."
cp /opt/dice/system/*.service /opt/dice/system/*.timer /etc/systemd/system/
install -m 644 /opt/dice/system/dice-session.pam /etc/pam.d/dice-session  # the desktop's own sign-in rules
systemctl daemon-reload 2>/dev/null || true
systemctl enable dice.service dice-boot.service dice-update.timer
# DiceOS takes the screen, so the usual desktop (if there is one) steps aside
for dm in lightdm gdm3 sddm; do
  if systemctl is-enabled "$dm" >/dev/null 2>&1; then echo "$dm" >> /var/lib/dice/display-managers; systemctl disable "$dm"; fi
done
systemctl set-default multi-user.target

if [ -n "$IMAGE" ] && [ "$PI" = 1 ]; then
  # the Pi image's own user: "dice", password "dice" (Settings, You, changes it).
  # (The PC image's live system makes its own "dice" user when it starts, and
  # its installer asks for a name and password.)
  if getent passwd 1000 >/dev/null; then
    OLD=$(getent passwd 1000 | cut -d: -f1)
    if [ "$OLD" != dice ]; then
      usermod -l dice -d /home/dice -m "$OLD"
      groupmod -n dice "$OLD" 2>/dev/null || true
    fi
  else
    useradd -m -u 1000 -s /bin/bash dice
  fi
  for g in sudo video audio input render netdev plugdev gpio i2c spi users; do getent group "$g" >/dev/null && usermod -aG "$g" dice; done
  echo 'dice:dice' | chpasswd
  echo 'dice ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/010_dice-nopasswd
  chmod 440 /etc/sudoers.d/010_dice-nopasswd
  # no first-boot questions on the screen: DiceOS asks its own, nicely
  systemctl disable userconfig.service 2>/dev/null || true
  rm -f /etc/ssh/sshd_config.d/rename_user.conf
fi

say "4 of 5: The start-up splash..."
rm -rf /usr/share/plymouth/themes/dice
cp -r /opt/dice/plymouth/dice /usr/share/plymouth/themes/dice
plymouth-set-default-theme dice 2>/dev/null || true
if command -v update-initramfs >/dev/null 2>&1; then update-initramfs -u >/dev/null 2>&1 || true; fi
if [ "$PI" = 1 ] && [ -f "$BOOT/cmdline.txt" ]; then
  LINE=$(head -n1 "$BOOT/cmdline.txt")
  for w in quiet splash plymouth.ignore-serial-consoles logo.nologo vt.global_cursor_default=0; do
    case " $LINE " in *" $w "*) ;; *) LINE="$LINE $w";; esac
  done
  printf '%s\n' "$LINE" > "$BOOT/cmdline.txt"
fi
if [ "$PI" = 1 ] && [ -f "$BOOT/config.txt" ] && ! grep -q '^disable_splash=1' "$BOOT/config.txt"; then printf '\n# DiceOS\ndisable_splash=1\n' >> "$BOOT/config.txt"; fi
# on a PC the splash needs "quiet splash" on the GRUB line instead
if [ "$PI" = 0 ] && [ -f /etc/default/grub ]; then
  if ! grep -q 'splash' /etc/default/grub; then
    sed -i 's/^GRUB_CMDLINE_LINUX_DEFAULT="\(.*\)"/GRUB_CMDLINE_LINUX_DEFAULT="\1 quiet splash"/' /etc/default/grub
    command -v update-grub >/dev/null 2>&1 && update-grub >/dev/null 2>&1 || true
  fi
fi

say "5 of 5: Your settings..."
if [ -n "$CODE" ]; then
  if curl -fsSL "$SITE/dice/setup/$CODE.json" -o "$SETTINGS_FILE"; then
    [ "$PI" = 0 ] && chmod 600 "$SETTINGS_FILE"  # it can hold your Wi-Fi password
    echo "Got your settings ($CODE). They'll be used when $THIS restarts."
  else
    echo "Couldn't get the settings for $CODE (codes last 30 days). DiceOS will ask instead."
  fi
else
  echo "No setup code, so DiceOS will ask the questions on the screen."
fi

if [ -z "$IMAGE" ]; then
  say "DiceOS is installed. Restart $THIS to start it:  sudo reboot"
  echo "(To take DiceOS off again later:  sudo /opt/dice/bin/dice-uninstall)"
fi
