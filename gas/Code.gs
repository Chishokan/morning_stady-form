/**
 * 秋のおはよう勉強会 申し込みフォーム — バックエンド（Google Apps Script）
 *
 * このスクリプトは Google スプレッドシートに紐づけて使います。
 * ・ウェブフォームからの申し込みを1行として追記
 * ・申込者へ自動返信メールを送信
 * ・送信できたら I列に「1」を立てる
 * ・I列が「1」でない行は resendUnsentMails() で再送（定期実行トリガー可）
 */

// ===== 基本設定 =====

// 記録先シートの名前（存在しなければ自動作成します）
var SHEET_NAME = "申し込みログ";

// スプレッドシートの見出し行
var HEADERS = [
  "受付日時",        // A
  "区分",            // B
  "お名前",          // C
  "メールアドレス",  // D
  "学年",            // E
  "学校名",          // F
  "所属",            // G
  "電話番号",        // H
  "送信済(1)",       // I  ← 自動返信メールの送信フラグ
];

// 列番号（1始まり）
var COL_NAME = 3;   // C列：お名前
var COL_EMAIL = 4;  // D列：メールアドレス
var COL_FLAG = 9;   // I列：送信済フラグ

// フラグとして書き込む値
var FLAG_SENT = 1;

// ===== メール設定 =====

// 自動返信を有効にするか
var SEND_AUTO_REPLY = true;

// 差出人の表示名
var SENDER_NAME = "株式会社智翔館NEP おはよう勉強会サポート";

// 返信先アドレス（空文字ならスクリプト実行者のアドレスが使われます）
var REPLY_TO = "";

// 管理者への控え送信（空文字なら送信しません。複数はカンマ区切り）
var ADMIN_EMAIL = "";

// 件名
var MAIL_SUBJECT = "【秋のおはよう勉強会】お申し込みありがとうございます（参加用Zoom URLのご案内）";

// 開催情報
// TODO: 秋の開催期間を確定したら書き換えてください（自動返信メールに記載されます）
var EVENT_PERIOD = "○/○(月)〜○/○(金)";
var EVENT_TIME = "6:00〜7:00";
var ZOOM_URL = "https://us06web.zoom.us/j/8031421632?pwd=YVRmWU9IT0pRa1N4Q0Q5SmZOYkJ0dz09";
var ZOOM_ID = "803 142 1632";
var ZOOM_PASSWORD = "2020";

// 再送を1回の実行で行う上限（送信上限に一気に達しないための安全弁）
var RESEND_LIMIT_PER_RUN = 50;

/**
 * ウェブフォームからの POST を受け取るエントリポイント。
 */
function doPost(e) {
  try {
    var data = parseBody(e);

    var name = String(data.name || "").trim();
    var email = String(data.email || "").trim();

    // 最低限のサーバー側バリデーション
    if (!name || !email) {
      return jsonResponse({ ok: false, error: "必須項目が不足しています。" });
    }

    var row = [
      new Date(),
      String(data.category || ""),
      name,
      email,
      String(data.grade || ""),
      String(data.school || ""),
      String(data.affiliation || ""),
      String(data.phone || ""),
      "", // I列：送信できたら後から 1 を書き込みます
    ];

    // 同時申し込みで行がずれないようロックを取得
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    var sheet, rowIndex;
    try {
      sheet = getSheet();
      sheet.appendRow(row);
      rowIndex = sheet.getLastRow();
    } finally {
      lock.releaseLock();
    }

    // 記録は完了しているので、メール送信で失敗しても申し込み自体は成功扱いにします。
    // 失敗した行は I列 が空のまま残り、resendUnsentMails() で再送されます。
    var sent = false;
    if (SEND_AUTO_REPLY) {
      var result = sendConfirmationMail(name, email);
      if (result.ok) {
        setFlag(sheet, rowIndex);
        sent = true;
      } else {
        Logger.log("自動返信の送信に失敗（" + rowIndex + "行目）: " + result.message);
      }
    }

    return jsonResponse({ ok: true, mailSent: sent });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

/**
 * I列が「1」でない行を探して自動返信メールを再送します。
 * 手動実行でも、時間主導型トリガー（installResendTrigger）でも使えます。
 */
function resendUnsentMails() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log("他の処理が実行中のためスキップしました。");
    return;
  }

  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("対象データがありません。");
      return;
    }

    var values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
    var sent = 0;
    var failed = 0;
    var skipped = 0;

    for (var i = 0; i < values.length; i++) {
      var rowIndex = i + 2;
      var row = values[i];

      // すでに送信済み（I列が 1）ならスキップ
      if (isSentFlag(row[COL_FLAG - 1])) continue;

      var name = String(row[COL_NAME - 1] || "").trim();
      var email = String(row[COL_EMAIL - 1] || "").trim();
      if (!name || !email) {
        skipped++;
        continue;
      }

      // 送信上限に近づいたら中断（残りは次回の実行で処理されます）
      if (MailApp.getRemainingDailyQuota() < 5) {
        Logger.log("送信上限が近いため中断しました（" + rowIndex + "行目以降）。");
        break;
      }
      if (sent >= RESEND_LIMIT_PER_RUN) {
        Logger.log("1回の上限（" + RESEND_LIMIT_PER_RUN + "件）に達したため中断しました。");
        break;
      }

      var result = sendConfirmationMail(name, email);
      if (result.ok) {
        setFlag(sheet, rowIndex);
        sent++;
      } else {
        failed++;
        Logger.log("再送に失敗（" + rowIndex + "行目 / " + email + "）: " + result.message);
      }

      Utilities.sleep(500); // 連続送信の間隔をあける
    }

    Logger.log("再送完了：送信 " + sent + "件 / 失敗 " + failed + "件 / 情報不足 " + skipped + "件");
  } finally {
    lock.releaseLock();
  }
}

/**
 * 再送処理を15分おきに自動実行するトリガーを設定します。
 * エディタ上で一度だけ実行してください。
 */
function installResendTrigger() {
  removeResendTrigger();
  ScriptApp.newTrigger("resendUnsentMails").timeBased().everyMinutes(15).create();
  Logger.log("15分おきの再送トリガーを設定しました。");
}

/**
 * 再送トリガーを解除します（勉強会の期間終了後などに実行してください）。
 */
function removeResendTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "resendUnsentMails") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * 動作確認用。ブラウザで URL を開いたときに表示されます。
 */
function doGet() {
  return jsonResponse({
    ok: true,
    message: "秋のおはよう勉強会 申し込み受付エンドポイントは稼働中です。",
  });
}

/**
 * 申込者へ自動返信メールを送信します。
 * 失敗しても例外は投げず、結果をオブジェクトで返します。
 */
function sendConfirmationMail(name, email) {
  if (!isValidEmail(email)) {
    return { ok: false, message: "メールアドレスの形式が不正です" };
  }

  try {
    var options = {
      name: SENDER_NAME,
      htmlBody: buildHtmlBody(name),
    };
    if (REPLY_TO) options.replyTo = REPLY_TO;
    if (ADMIN_EMAIL) options.bcc = ADMIN_EMAIL;

    MailApp.sendEmail(email, MAIL_SUBJECT, buildPlainBody(name), options);

    return { ok: true, message: "送信済み" };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

/**
 * I列に送信済フラグ（1）を書き込みます。
 */
function setFlag(sheet, rowIndex) {
  try {
    sheet.getRange(rowIndex, COL_FLAG).setValue(FLAG_SENT);
  } catch (err) {
    Logger.log("フラグの書き込みに失敗（" + rowIndex + "行目）: " + String(err));
  }
}

/**
 * I列の値が「送信済み」を意味するかどうか。
 * 数値の1、文字列の"1"、TRUE などを送信済みとみなします。
 */
function isSentFlag(value) {
  if (value === true) return true;
  var v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "済" || v === "送信済み";
}

/**
 * 自動返信メールの本文（テキスト版）。
 */
function buildPlainBody(name) {
  return [
    name + " 様",
    "",
    "秋のおはよう勉強会にお申し込みいただいた皆さまへ",
    "",
    "このたびは「秋のおはよう勉強会」にお申し込みいただき、誠にありがとうございます。",
    "",
    "■ 開催概要",
    "期間：" + EVENT_PERIOD,
    "時間：" + EVENT_TIME,
    "",
    "■ 参加用Zoom URL",
    ZOOM_URL,
    "",
    "Zoom ID：" + ZOOM_ID,
    "パスワード：" + ZOOM_PASSWORD,
    "",
    "────────────────",
    "① 準備するもの",
    "────────────────",
    "・Zoom参加用のスマートフォン（またはPC・タブレット）",
    "　※参加中はカメラをオンにしてください。顔を映したくない場合は、手元が映るようにカメラを調整してください。",
    "",
    "・学習道具",
    "　テキスト、計算演習、学校の課題など",
    "　1時間で何を学習するか、あらかじめ計画してから参加しましょう。",
    "",
    "────────────────",
    "② 当日の流れ・注意事項",
    "────────────────",
    "1. 開始5分前の5:55には、Zoomへの入室が完了するようにしてください。",
    "2. 勉強会がスタートしたら、チャットで今日の学習予定を送信しましょう。",
    "3. カメラは必ずオンにしてください。",
    "4. 生徒同士でのチャットのやり取りはできません。",
    "5. 途中退室しなければならない時は、リフレクションを入力してから退出してください。",
    "",
    "最後にリフレクションの入力があります。学習内容・集中度・感想を入力してから退出してください。",
    "",
    "────────────────",
    "",
    "株式会社智翔館NEP",
    "おはよう勉強会サポート",
    "担当：安藤 純平",
  ].join("\n");
}

/**
 * 自動返信メールの本文（HTML版・Zoom URLをクリック可能にします）。
 */
function buildHtmlBody(name) {
  var n = escapeHtml(name);
  return [
    '<div style="font-family:Hiragino Sans,Meiryo,sans-serif;font-size:14px;line-height:1.8;color:#222;">',
    "<p>" + n + " 様</p>",
    "<p>秋のおはよう勉強会にお申し込みいただいた皆さまへ</p>",
    "<p>このたびは「秋のおはよう勉強会」にお申し込みいただき、誠にありがとうございます。</p>",
    "<p><strong>■ 開催概要</strong><br>",
    "期間：" + EVENT_PERIOD + "<br>",
    "時間：" + EVENT_TIME + "</p>",
    "<p><strong>■ 参加用Zoom URL</strong><br>",
    '<a href="' + ZOOM_URL + '">' + ZOOM_URL + "</a><br>",
    "Zoom ID：" + ZOOM_ID + "<br>",
    "パスワード：" + ZOOM_PASSWORD + "</p>",
    "<hr>",
    "<p><strong>① 準備するもの</strong></p>",
    "<ul>",
    "<li>Zoom参加用のスマートフォン（またはPC・タブレット）<br>",
    "※参加中はカメラをオンにしてください。顔を映したくない場合は、手元が映るようにカメラを調整してください。</li>",
    "<li>学習道具（テキスト、計算演習、学校の課題など）<br>",
    "1時間で何を学習するか、あらかじめ計画してから参加しましょう。</li>",
    "</ul>",
    "<hr>",
    "<p><strong>② 当日の流れ・注意事項</strong></p>",
    "<ol>",
    "<li>開始5分前の5:55には、Zoomへの入室が完了するようにしてください。</li>",
    "<li>勉強会がスタートしたら、チャットで今日の学習予定を送信しましょう。</li>",
    "<li>カメラは必ずオンにしてください。</li>",
    "<li>生徒同士でのチャットのやり取りはできません。</li>",
    "<li>途中退室しなければならない時は、リフレクションを入力してから退出してください。</li>",
    "</ol>",
    "<p>最後にリフレクションの入力があります。学習内容・集中度・感想を入力してから退出してください。</p>",
    "<hr>",
    "<p>株式会社智翔館NEP<br>おはよう勉強会サポート<br>担当：安藤 純平</p>",
    "</div>",
  ].join("");
}

/**
 * リクエストボディを JSON として解析します。
 * フォームは text/plain で JSON 文字列を送信します。
 */
function parseBody(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (parseErr) {
      // application/x-www-form-urlencoded で来た場合のフォールバック
      if (e.parameter) return e.parameter;
      throw parseErr;
    }
  }
  return (e && e.parameter) || {};
}

/**
 * 記録先シートを取得します。無ければ作成し、見出し行を書き込みます。
 * 既存シートの見出しは上書きしません（I列が空のときだけ見出しを補います）。
 */
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    var flagHeader = sheet.getRange(1, COL_FLAG);
    if (!String(flagHeader.getValue()).trim()) {
      flagHeader.setValue(HEADERS[COL_FLAG - 1]).setFontWeight("bold");
    }
  }
  return sheet;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * JSON レスポンスを返します。
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(
    JSON.stringify(obj)
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * テスト用：自分宛てに自動返信メールを送ってレイアウトを確認します。
 * エディタ上でこの関数を選択して実行してください。
 */
function testSendMail() {
  var me = Session.getActiveUser().getEmail();
  var result = sendConfirmationMail("テスト 太郎", me);
  Logger.log(result.message);
}

/**
 * 確認用：未送信（I列が1でない）の件数をログに出します。実際の送信は行いません。
 */
function countUnsent() {
  var sheet = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("対象データがありません。");
    return;
  }
  var flags = sheet.getRange(2, COL_FLAG, lastRow - 1, 1).getValues();
  var count = 0;
  for (var i = 0; i < flags.length; i++) {
    if (!isSentFlag(flags[i][0])) count++;
  }
  Logger.log("未送信：" + count + "件 / 全 " + (lastRow - 1) + "件");
}
