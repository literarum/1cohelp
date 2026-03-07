#!/bin/bash
# Скрипт автоматической установки CRL-Helper для macOS
# Использование: curl -fsSL URL | bash -s -- [BASE_URL]
# BASE_URL — опционально; если не задан, используется GitHub main

BASE="${1:-https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site}"
BASE="${BASE//$'\r'/}"
BASE="${BASE%%[[:space:]]*}"

echo "🚀 Начинаем установку CRL-Helper для Copilot 1CO..."

INSTALL_DIR="$HOME/Library/Application Support/CRL-Helper"
mkdir -p "$INSTALL_DIR"

BIN_PATH="$INSTALL_DIR/CRL-Helper-macos"

echo "⬇️ Скачиваем компоненту..."
rm -f /tmp/crl-helper.zip
rm -f /tmp/crl-helper-bin

# Try to download the raw binary first (if it's hosted in /downloads/)
if curl -fsSL "$BASE/downloads/CRL-Helper-macos" -o /tmp/crl-helper-bin 2>/dev/null && [ -s /tmp/crl-helper-bin ]; then
    echo "📦 Файл скачан (бинарник)."
    mv /tmp/crl-helper-bin "$BIN_PATH"
else
    # Fallback to ZIP
    if curl -fsSL "$BASE/files/CRL-Helper-macos.zip" -o /tmp/crl-helper.zip 2>/dev/null && [ -s /tmp/crl-helper.zip ]; then
        echo "📦 Распаковываем..."
        unzip -qo /tmp/crl-helper.zip -d "$INSTALL_DIR"
        rm -f /tmp/crl-helper.zip
    else
        # Try github raw
        if curl -fsSL "https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site/files/CRL-Helper-macos.zip" -o /tmp/crl-helper.zip 2>/dev/null && [ -s /tmp/crl-helper.zip ]; then
            echo "📦 Распаковываем (GitHub)..."
            unzip -qo /tmp/crl-helper.zip -d "$INSTALL_DIR"
            rm -f /tmp/crl-helper.zip
        else
            echo "❌ Ошибка: не удалось скачать компоненту. Проверьте подключение и URL."
            exit 1
        fi
    fi
fi

if [ ! -f "$BIN_PATH" ]; then
    echo "❌ Ошибка: файл $BIN_PATH не найден после установки!"
    exit 1
fi

echo "🔓 Настраиваем права доступа..."
xattr -d com.apple.quarantine "$BIN_PATH" 2>/dev/null || true
chmod +x "$BIN_PATH"

echo "⚙️ Настраиваем фоновую службу (автозапуск)..."
# KeepAlive false: process does not auto-restart if it exits; user can run the binary again if needed
PLIST_PATH="$HOME/Library/LaunchAgents/ru.crl.helper.plist"
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ru.crl.helper</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BIN_PATH</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
EOF

echo "▶️ Запускаем службу..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "Проверяем, отвечает ли служба на порту 7777..."
sleep 5
code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 http://127.0.0.1:7777/health 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
    echo "✅ Установка успешно завершена!"
    echo "Служба CRL-Helper работает. Можете закрыть терминал и вернуться в браузер."
else
    echo "⚠️ Служба установлена, но проверка порта не прошла (код $code)."
    echo ""
    echo "Сделайте одно из следующего:"
    echo "  1) Запустите компоненту вручную в Терминале:"
    echo "     \"\$HOME/Library/Application Support/CRL-Helper/CRL-Helper-macos\" &"
    echo ""
    echo "  2) Если при этом появляется «Адрес уже используется» (Address already in use) — порт 7777 занят. Освободите порт:"
    echo "     lsof -ti:7777 | xargs kill 2>/dev/null; launchctl bootout gui/\$(id -u) \"\$HOME/Library/LaunchAgents/ru.crl.helper.plist\" 2>/dev/null"
    echo "     Затем снова запустите компоненту (команда из п. 1)."
    echo ""
    echo "  3) Если macOS блокирует запуск: Системные настройки → Конфиденциальность и безопасность → «Всё равно открыть» для CRL-Helper-macos."
    echo ""
    echo "После запуска нажмите «Проверить снова» на странице проверки сертификатов."
fi
