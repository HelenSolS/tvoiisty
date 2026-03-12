#!/usr/bin/env bash
# Запускать НА СЕРВЕРЕ (скопировать целиком в ssh и вставить).
# Найдёт папки newstyle и покажет размер; потом удалит по твоему подтверждению.

echo "=== Ищем папки newstyle на сервере ==="
find /root /opt /home -maxdepth 4 -type d -name "newstyle" 2>/dev/null | while read -r dir; do
  if [ -d "$dir" ]; then
    size=$(du -sh "$dir" 2>/dev/null | cut -f1)
    echo "Найдено: $dir (размер: $size)"
  fi
done

echo ""
echo "=== Ищем большие папки с node_modules в /root (скорее всего залив) ==="
find /root -maxdepth 3 -type d -name "node_modules" 2>/dev/null | while read -r nm; do
  parent=$(dirname "$nm")
  size=$(du -sh "$parent" 2>/dev/null | cut -f1)
  echo "Папка: $parent (размер: $size)"
done

echo ""
echo "Удалить всё найденное? Введи: rm -rf /root/newstyle"
echo "(или подставь путь из списка выше)"
echo "Либо выполни одной командой (удалит /root/newstyle и /opt/newstyle если есть):"
echo "  rm -rf /root/newstyle /opt/newstyle"
