"""Rule-based pre-labels for scraped hyperlinks. High-precision patterns only;
anything not matched is 'unknown' (left for review)."""
import re

LABELS = ['content', 'partial', 'login_wall', 'not_found', 'blocked', 'generic_page', 'error_page', 'empty']

RULES = [
    # (label, rule_id, field, regex)
    ('login_wall', 'fb_login_title', 'title', r'^(登入或註冊即可查看|このページを見るには、ログインまたは登録してください|Log in or sign up to view|Log into Facebook|Log into Facebook \| Facebook|Facebookにログイン \| Facebook|Join TikTok and see what I.ve been up to!|登入 Facebook|Facebook - 登入或註冊|Facebook – log in or sign up|Instagram|Login • Instagram|Threads|Log in • Threads)$'),
    ('login_wall', 'fb_login_summary', 'summary', r'(Log in to join them on Facebook|You must log in to continue|^NoticeYou must log in|Log in to Facebook to start sharing|登入 Facebook 以開始分享|到 Facebook 上查看貼文、相片和更多內容|See posts, photos and more on Facebook|Facebook に登録して|請登入以繼續|Log in to see photos and videos)'),
    ('login_wall', 'generic_login', 'title', r'(?i)^(sign in|log ?in|登入|會員登入|請先登入)\b'),
    ('blocked', 'cf_challenge', 'title', r'^(Just a moment\.\.\.|Attention Required! \| Cloudflare|請稍候…|Cloudflare WAF 連線錯誤頁面|Access Denied|403 Forbidden|Forbidden|ERROR: The request could not be satisfied|Too Many Requests|429 Too Many Requests)$'),
    ('blocked', 'block_title2', 'title', r'(?i)^(機能の一時停止|你暂时被禁止使用此功能|You’re Temporarily Blocked|Security Check|Access denied( \| .* used Cloudflare to restrict access)?|Please Wait\.\.\. \| Cloudflare|Bloomberg - Are you a robot\?|Are you a robot\?|Yahoo is now a part of (Verizon Media|Oath))$'),
    ('blocked', 'bot_summary', 'summary', r'(Why have I been blocked\?|Performing security verification|Verify you are human|Complete the security check before continuing|Our systems have detected unusual traffic|You’re Temporarily Blocked|Request blocked\.|表示您的網路已遭到停止訪問|Enable JavaScript and cookies to continue|checking your browser)'),
    ('not_found', 'nf_title', 'title', r'(?i)(\b404\b|not found|找不到(網頁|頁面|該頁面|您要的)|頁面不存在|網頁不存在|page (isn.t|is not) available|content (isn.t|is not) available|video unavailable|這個內容目前無法顯示|此內容目前無法顯示|文章不存在|已下架|已刪除|Page Not Found|ページが見つかりません)'),
    ('not_found', 'nf_summary', 'summary', r'(?i)^(Invalid link|This content isn.t available|此內容目前無法顯示|這個影片無法播放|Video unavailable|This video isn.t available|The link you followed may be broken|你點擊的連結可能已損毀|很抱歉，此頁面無法使用|Sorry, this page isn.t available)'),
    ('generic_page', 'yt_default', 'summary', r'^(在 YouTube 上盡情享受自己喜愛的影片和音樂|YouTube でお気に入りの動画や音楽を楽しみ|Enjoy the videos and music you love, upload original content)'),
    ('login_wall', 'fb_footer', 'summary', r'^(Sign UpLog InMessengerFacebook Lite|To continue using Facebook, get one of the browsers)'),
    ('partial', 'fb_login_chrome', 'summary', r'^FacebookLog InLog InForgot Account\?'),
    ('generic_page', 'site_home_title', 'title', r'(-首頁|－首頁|\| 首頁|^首頁 ?[|｜-])'),
    ('error_page', 'err_title', 'title', r'(?i)^(\d{3} - |\d{3} Server Error|500 Internal Server Error|502 Bad Gateway|503 Service|504 Gateway|Bad Request|Server Error|Error$|錯誤$|Site Maintenance|網站維護中)'),
    ('error_page', 'unsupported_browser', 'summary', r'(?i)^(unsupported browser|your browser is not supported|不支援您的瀏覽器|Sorry, we.re having trouble playing this video\.Learn more$)'),
]
COMPILED = [(l, rid, f, re.compile(rx)) for l, rid, f, rx in RULES]


def pre_label(title, summary, status=None, error=None):
    title = (title or '').strip()
    summary = (summary or '').strip()
    for label, rid, field, rx in COMPILED:
        if rx.search(title if field == 'title' else summary):
            return label, rid
    if status in ('404', '410'):
        return 'not_found', 'http_' + status
    if status in ('401', '403', '429'):
        return 'blocked', 'http_' + status
    if not title and not summary:
        return 'empty', 'no_title_summary'
    return 'unknown', None
