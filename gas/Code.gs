/**
 * 夏休みおはよう勉強会 申し込みフォーム — バックエンド（Google Apps Script）
 *
 * このスクリプトは Google スプレッドシートに紐づけて使います。
 * ウェブフォームから送信された申し込みデータを受け取り、
 * スプレッドシートの1行として追記します。
 *
 * セットアップ手順は プロジェクトルートの README.md を参照してください。
 */

// 記録先シートの名前（存在しなければ自動作成します）
var SHEET_NAME = "申し込みログ";

// スプレッドシートの見出し行
var HEADERS = [
  "受付日時",
  "お名前",
  "メールアドレス",
  "学年",
  "学校名",
  "所属",
];

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

    var sheet = getSheet();
    sheet.appendRow([
      new Date(),
      name,
      email,
      String(data.grade || ""),
      String(data.school || ""),
      String(data.affiliation || ""),
    ]);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

/**
 * 動作確認用。ブラウザで URL を開いたときに表示されます。
 */
function doGet() {
  return jsonResponse({
    ok: true,
    message: "夏休みおはよう勉強会 申し込み受付エンドポイントは稼働中です。",
  });
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
  }
  return sheet;
}

/**
 * JSON レスポンスを返します。
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(
    JSON.stringify(obj)
  ).setMimeType(ContentService.MimeType.JSON);
}
