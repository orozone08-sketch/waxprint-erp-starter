const ERP_IMPORT_URL = 'https://waxprint-erp.orozone08.workers.dev/api/integrations/gmail/bridge/import';
const ERP_BRIDGE_TOKEN = 'PASTE_ERP_BRIDGE_KEY_HERE';
const GMAIL_SEARCH_QUERY = 'is:unread has:attachment';
const MAX_MESSAGES_PER_RUN = 25;
const MAX_MESSAGE_ATTACHMENT_BYTES = 24 * 1024 * 1024;
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/';

/** Copies unread Gmail attachments into the WaxPrint ERP Inbox without changing Gmail. */
function syncGmailToErp() {
  if (ERP_BRIDGE_TOKEN === 'PASTE_ERP_BRIDGE_KEY_HERE') {
    throw new Error('Download a fresh script from ERP Settings so it contains your private bridge key.');
  }

  const listed = gmailApi('messages', { q: GMAIL_SEARCH_QUERY, maxResults: MAX_MESSAGES_PER_RUN });
  const messages = listed.messages || [];
  let importedMessages = 0;
  let importedFiles = 0;
  let skippedMessages = 0;
  let failedMessages = 0;

  messages.forEach(function (reference) {
    try {
      const message = gmailApi('messages/' + encodeURIComponent(reference.id), { format: 'full' });
      const headers = (message.payload && message.payload.headers) || [];
      const header = function (name) {
        const item = headers.find(function (entry) { return entry.name.toLowerCase() === name; });
        return item ? item.value : '';
      };
      const attachments = [];
      const bodyParts = [];
      let totalBytes = 0;

      collectParts(message.id, message.payload || {}, attachments, bodyParts, function (size) {
        totalBytes += size;
        if (totalBytes > MAX_MESSAGE_ATTACHMENT_BYTES) {
          throw new Error('Attachments exceed the 24 MB per-email bridge limit.');
        }
      });

      if (!attachments.length) return;

      const response = UrlFetchApp.fetch(ERP_IMPORT_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ERP_BRIDGE_TOKEN },
        payload: JSON.stringify({
          message_id: message.id,
          sender: header('from'),
          subject: header('subject'),
          body: bodyParts.join('\n\n').slice(0, 8000) || message.snippet || '',
          received_at: new Date(Number(message.internalDate)).toISOString(),
          attachments: attachments
        }),
        muteHttpExceptions: true
      });
      const status = response.getResponseCode();
      if (status < 200 || status >= 300) {
        throw new Error('ERP returned ' + status + ': ' + response.getContentText().slice(0, 300));
      }

      const result = JSON.parse(response.getContentText());
      if (!result.ok) throw new Error('ERP did not confirm the import.');
      if (result.already_imported) {
        skippedMessages++;
      } else {
        importedMessages++;
        importedFiles += Number(result.attachments_imported || 0);
      }
    } catch (error) {
      failedMessages++;
      console.error('Could not import Gmail message ' + reference.id + ': ' + error);
    }
  });

  const summary = 'Imported ' + importedMessages + ' new message(s), saved ' + importedFiles + ' file(s), already in ERP ' + skippedMessages + ', failed ' + failedMessages + '. Gmail messages were left unchanged.';
  console.log(summary);
  return summary;
}

/** Installs or replaces the automatic 15-minute Gmail sync trigger. */
function installGmailSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncGmailToErp') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncGmailToErp').timeBased().everyMinutes(15).create();
  console.log('Automatic Gmail sync is scheduled every 15 minutes.');
}

function gmailApi(path, params, method, payload) {
  const url = GMAIL_API + path + (Object.keys(params).length ? '?' + toQuery(params) : '');
  const options = {
    method: method || 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Gmail API returned ' + status + ': ' + response.getContentText().slice(0, 300));
  }
  return response.getContentText() ? JSON.parse(response.getContentText()) : {};
}

function toQuery(params) {
  return Object.keys(params).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
}

function collectParts(messageId, part, attachments, bodyParts, countBytes) {
  const filename = (part.filename || '').trim();
  if (filename && part.body && (part.body.attachmentId || part.body.data)) {
    let data = part.body.data || '';
    if (part.body.attachmentId) {
      const result = gmailApi('messages/' + encodeURIComponent(messageId) + '/attachments/' + encodeURIComponent(part.body.attachmentId), {});
      data = result.data || '';
    }
    const bytes = Utilities.base64DecodeWebSafe(data);
    countBytes(bytes.length);
    attachments.push({
      filename: filename,
      mime_type: part.mimeType || 'application/octet-stream',
      data: Utilities.base64Encode(bytes)
    });
  } else if (part.mimeType === 'text/plain' && part.body && part.body.data) {
    const bytes = Utilities.base64DecodeWebSafe(part.body.data);
    bodyParts.push(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
  }
  (part.parts || []).forEach(function (child) {
    collectParts(messageId, child, attachments, bodyParts, countBytes);
  });
}
