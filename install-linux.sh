#!/bin/bash
# Скрипт автоматической установки CRL-Helper для Linux
# Использование: curl -fsSL URL | bash -s -- [BASE_URL]
# BASE_URL — опционально; если не задан, используется GitHub main

BASE="${1:-https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site}"
BASE="${BASE//$'\r'/}"
BASE="${BASE%%[[:space:]]*}"

echo "🚀 Начинаем установку CRL-Helper для Copilot 1CO..."

INSTALL_DIR="$HOME/.local/share/CRL-Helper"
mkdir -p "$INSTALL_DIR"

BIN_PATH="$INSTALL_DIR/CRL-Helper-linux"

echo "⬇️ Скачиваем компоненту..."
rm -f /tmp/crl-helper.zip
rm -f /tmp/crl-helper-bin

if command -v curl >/dev/null 2>&1; then
    DOWNLOAD_CMD="curl -fsSL"
else
    DOWNLOAD_CMD="wget -qO-"
fi

# Try binary first
if $DOWNLOAD_CMD "$BASE/downloads/CRL-Helper-linux" > /tmp/crl-helper-bin 2>/dev/null && [ -s /tmp/crl-helper-bin ]; then
    echo "📦 Файл скачан (бинарник)."
    mv /tmp/crl-helper-bin "$BIN_PATH"
else
    # Fallback to ZIP
    if $DOWNLOAD_CMD "$BASE/files/CRL-Helper-linux.zip" > /tmp/crl-helper.zip 2>/dev/null && [ -s /tmp/crl-helper.zip ]; then
        echo "📦 Распаковываем..."
        unzip -qo /tmp/crl-helper.zip -d "$INSTALL_DIR"
        rm -f /tmp/crl-helper.zip
    else
        if $DOWNLOAD_CMD "https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site/files/CRL-Helper-linux.zip" > /tmp/crl-helper.zip 2>/dev/null && [ -s /tmp/crl-helper.zip ]; then
            echo "📦 Распаковываем (GitHub)..."
            unzip -qo /tmp/crl-helper.zip -d "$INSTALL_DIR"
            rm -f /tmp/crl-helper.zip
        else
            echo "❌ Ошибка: не удалось скачать архив. Проверьте подключение и URL."
            exit 1
        fi
    fi
fi

if [ ! -f "$BIN_PATH" ]; then
    echo "❌ Ошибка: файл $BIN_PATH не найден после установки!"
    exit 1
fi

chmod +x "$BIN_PATH"

echo "⚙️ Настраиваем фоновую службу (автозапуск)..."
if command -v systemctl >/dev/null 2>&1 && [ -d "$HOME/.config/systemd/user" ]; then
    mkdir -p "$HOME/.config/systemd/user"
    cat > "$HOME/.config/systemd/user/ru.crl.helper.service" << EOF
[Unit]
Description=CRL-Helper для Copilot 1CO
After=network.target

[Service]
Type=simple
ExecStart=$BIN_PATH
Restart=on-failure

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable ru.crl.helper.service
    systemctl --user start ru.crl.helper.service
    echo "▶️ Служба systemd запущена."
else
    (crontab -l 2>/dev/null | grep -v "CRL-Helper"; echo "@reboot $BIN_PATH") | crontab -
    echo "▶️ Добавлено в cron (@reboot)."
    $BIN_PATH &
fi

echo ""
echo "✅ Установка успешно завершена!"
echo "Служба CRL-Helper теперь работает в фоне."
echo "Можете закрыть терминал и вернуться в браузер."
