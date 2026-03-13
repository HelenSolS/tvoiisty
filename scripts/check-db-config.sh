#!/usr/bin/env bash
# Проверка: совпадают ли имя БД, пользователь и пароль у Postgres и backend.
# Запуск на сервере из каталога проекта: cd /opt/tvoiisty && bash scripts/check-db-config.sh

set -e
cd "$(dirname "$0")/.."

echo "=== 1. Что задано в docker-compose для Postgres ==="
echo "   POSTGRES_USER:   tvoiisty (зашито в compose)"
echo "   POSTGRES_DB:     tvoiisty_db (зашито в compose)"
echo "   POSTGRES_PASSWORD: из .env PGPASSWORD, если нет — strongpassword"
echo ""

echo "=== 2. Что в .env (только имена переменных, не значения) ==="
if [ -f .env ]; then
  for v in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE; do
    if grep -q "^${v}=" .env; then
      val=$(grep "^${v}=" .env | cut -d= -f2-)
      if [ "$v" = "PGPASSWORD" ] && [ -n "$val" ]; then
        echo "   ${v}=***задан***"
      else
        echo "   ${v}=${val:-<пусто>}"
      fi
    else
      echo "   ${v}=<нет в .env>"
    fi
  done
else
  echo "   .env не найден"
fi
echo ""

echo "=== 3. С каким паролем реально принимает подключения Postgres ==="
echo "   (проверка из контейнера postgres)"
docker exec tvoiisty_postgres psql -U tvoiisty -d tvoiisty_db -t -c "SELECT 'OK: подключение под tvoiisty к tvoiisty_db успешно';" 2>/dev/null && echo "   Подключение без пароля из хоста контейнера: возможно (trust для local)" || true
echo ""

echo "=== 4. С какими переменными стартует backend ==="
docker exec tvoiisty_backend sh -c 'echo "   PGHOST=$PGHOST PGPORT=$PGPORT PGUSER=$PGUSER PGDATABASE=$PGDATABASE PGPASSWORD=${PGPASSWORD:+задан}"' 2>/dev/null || echo "   (контейнер backend не запущен)"
echo ""

echo "=== 5. Проверка подключения backend к БД (один запрос) ==="
docker exec tvoiisty_backend node -e "
const pg = require('pg');
const c = {
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE
};
const pool = new pg.Pool(c);
pool.query('SELECT current_database(), current_user')
  .then(r => { console.log('   DB:', r.rows[0].current_database, '| User:', r.rows[0].current_user); pool.end(); })
  .catch(e => { console.error('   Ошибка:', e.message); pool.end(); process.exit(1); });
" 2>/dev/null || echo "   Контейнер backend не запущен или ошибка"
echo ""

echo "=== Итог ==="
echo "   • Имя БД везде должно быть: tvoiisty_db"
echo "   • Пользователь везде: tvoiisty"
echo "   • Пароль: в .env должен быть PGPASSWORD=<тот же>, что при первом создании тома postgres."
echo "   • Если пароль меняли — либо везде один и тот же, либо пересоздать том: docker compose down -v && docker compose up -d --build"
echo ""
