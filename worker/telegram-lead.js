/**
 * Cloudflare Worker: принимает заявки с лендинга и пересылает их в Telegram.
 *
 * Секреты (задаются в Cloudflare, НЕ в коде и НЕ в репозитории):
 *   TG_TOKEN    — токен бота от @BotFather
 *   TG_CHAT_ID  — id чата/группы, куда слать заявки (для групп начинается с -100…)
 * Переменная:
 *   ALLOWED_ORIGINS — через запятую, откуда разрешены заявки,
 *                     например: https://rdana743.github.io,https://bhsad.ru
 */

const SOURCES = {
  hero: 'Форма на первом экране',
  quiz: 'Тест «Какой эксперимент ваш?»',
  final: 'Финальная форма',
  exit: 'Всплывающее окно / обратный звонок',
};

const esc = (v) =>
  String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).slice(0, 500);

function cors(origin, allowed) {
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if (allowed.length && !allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers });

    let d;
    try {
      d = await request.json();
    } catch {
      return new Response('Bad JSON', { status: 400, headers });
    }

    // ловушка для спам-ботов: скрытое поле должно быть пустым
    if (d.website) return new Response('ok', { status: 200, headers });

    const phone = String(d.phone || '').replace(/\D/g, '');
    const name = String(d.name || '').trim();
    if (!name || phone.length < 11) return new Response('Invalid', { status: 422, headers });

    const utm = Object.entries(d)
      .filter(([k]) => /^(utm_|yclid|gclid)/.test(k))
      .map(([k, v]) => `${esc(k)}: ${esc(v)}`)
      .join('\n');

    const lines = [
      `🔬 <b>Заявка: ${esc(d.direction || 'направление не выбрано')}</b>`,
      'Всемирный день науки · промокод НАУКА',
      '',
      `<b>Имя:</b> ${esc(name)}`,
      `<b>Телефон:</b> +${phone}`,
      d.quiz ? `<b>Ответы теста:</b> ${esc(d.quiz)}` : null,
      '',
      `<b>Где оставил:</b> ${esc(SOURCES[d.source] || d.source)}`,
      utm ? `<b>UTM:</b>\n${utm}` : null,
      d.page ? `<b>Страница:</b> ${esc(d.page)}` : null,
    ].filter((l) => l !== null);

    const tg = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TG_CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!tg.ok) return new Response('Telegram error', { status: 502, headers });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};
