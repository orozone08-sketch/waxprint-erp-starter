const ERP_BRIDGE_BASE = 'https://waxprint-erp.orozone08.workers.dev/api/integrations/gmail/bridge';
const ERP_BRIDGE_TOKEN = 'PASTE_ERP_BRIDGE_KEY_HERE';
// Include print CAD files plus RAR bundles that contain STL/CAM files.
const GMAIL_SEARCH_QUERY = 'has:attachment {filename:stl filename:cam filename:rar}';
// Process one large CAD/RAR email per run to keep Apps Script memory bounded.
const MAX_NEW_MESSAGES_PER_RUN = 1;
const MAX_GMAIL_MESSAGES_TO_SCAN = 500;
const MAX_ATTACHMENT_BYTES = 45 * 1024 * 1024;
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/';

/** Imports Gmail messages with print files, including historical messages that need attachment backfill. Gmail is only read, never changed. */
function syncGmailToErp() {
  if (!ERP_BRIDGE_TOKEN || ERP_BRIDGE_TOKEN === 'PASTE_ERP_BRIDGE_KEY_HERE') {
    throw new Error('Download the latest Gmail bridge script from ERP Settings.');
  }

  let pageToken = '';
  let scanned = 0;
  let attempted = 0;
  let importedMessages = 0;
  let importedFiles = 0;
  let failedMessages = 0;
  let alreadyImportedMessages = 0;

  while (scanned < MAX_GMAIL_MESSAGES_TO_SCAN && attempted < MAX_NEW_MESSAGES_PER_RUN) {
    const params = { q: GMAIL_SEARCH_QUERY, maxResults: 25 };
    if (pageToken) params.pageToken = pageToken;
    const listed = gmailApi('messages', params);
    const messages = listed.messages || [];
    if (!messages.length) break;

    for (let i = 0; i < messages.length && scanned < MAX_GMAIL_MESSAGES_TO_SCAN && attempted < MAX_NEW_MESSAGES_PER_RUN; i++) {
      const reference = messages[i];
      scanned++;
      try {
        const message = gmailApi('messages/' + encodeURIComponent(reference.id), { format: 'full' });
        const headers = (message.payload && message.payload.headers) || [];
        const header = function (name) {
          const item = headers.find(function (entry) { return entry.name.toLowerCase() === name; });
          return item ? item.value : '';
        };
        const attachments = [];
        const bodyParts = [];
        collectParts(message.payload || {}, attachments, bodyParts, '0');
        // Gmail can expose forwarded or nonstandard MIME attachments in a
        // shape the REST payload walker does not recognize. Ask GmailApp for
        // the message's actual attachment blobs as a fallback.
        if (!attachments.length) {
          const gmailMessage = GmailApp.getMessageById(message.id);
          const blobs = gmailMessage.getAttachments({
            includeInlineImages: false,
            includeAttachments: true
          });
          blobs.forEach(function (blob, index) {
            attachments.push({
              filename: blob.getName() || ('attachment-' + (index + 1) + '.bin'),
              mimeType: blob.getContentType() || 'application/octet-stream',
              partKey: 'gmailapp:' + index,
              attachmentId: '',
              data: Utilities.base64Encode(blob.getBytes())
            });
          });
        }
        if (!attachments.length) {
          console.warn('Gmail returned no downloadable attachment for "' + header('subject') + '" (' + message.id + '). Message left retryable.');
          continue;
        }

        const started = bridgeJson('message', {
          message_id: message.id,
          sender: header('from'),
          subject: header('subject'),
          body: bodyParts.join('\n\n').slice(0, 8000) || message.snippet || '',
          received_at: new Date(Number(message.internalDate)).toISOString()
        });
        // Skip completed emails so the one-message-per-run limit can reach
        // older emails whose attachments have not been saved yet. The bridge
        // only reports already_imported when it has a saved attachment; emails
        // with zero files and incomplete imports remain retryable.
        if (started.already_imported) {
          alreadyImportedMessages++;
          continue;
        }
        attempted++;

        let savedForMessage = 0;
        attachments.forEach(function (attachment) {
          let data = attachment.data || '';
          if (attachment.attachmentId) {
            const result = gmailApi('messages/' + encodeURIComponent(message.id) + '/attachments/' + encodeURIComponent(attachment.attachmentId), {});
            data = result.data || '';
          }
          const bytes = Utilities.base64DecodeWebSafe(data);
          if (bytes.length > MAX_ATTACHMENT_BYTES) {
            throw new Error(attachment.filename + ' is larger than the 45 MB file limit.');
          }
          const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
            .map(function (value) { return (value & 255).toString(16).padStart(2, '0'); }).join('');
          const response = UrlFetchApp.fetch(ERP_BRIDGE_BASE + '/attachment', {
            method: 'post',
            contentType: 'application/octet-stream',
            headers: {
              Authorization: 'Bearer ' + ERP_BRIDGE_TOKEN,
              'X-Gmail-Message-Id': message.id,
              'X-Gmail-Part-Key': attachment.partKey,
              'X-Gmail-Filename': encodeURIComponent(attachment.filename),
              'X-Gmail-Mime-Type': attachment.mimeType,
              'X-Gmail-SHA256': digest
            },
            payload: bytes,
            muteHttpExceptions: true
          });
          const status = response.getResponseCode();
          if (status < 200 || status >= 300) {
            throw new Error('ERP file upload returned ' + status + ': ' + response.getContentText().slice(0, 250));
          }
          const result = JSON.parse(response.getContentText());
          if (!result.ok) throw new Error('ERP did not confirm the file upload.');
          if (!result.already_imported) savedForMessage++;
        });

        bridgeJson('complete', { message_id: message.id });
        importedMessages++;
        importedFiles += savedForMessage;
      } catch (error) {
        failedMessages++;
        console.error('Could not import Gmail message ' + reference.id + ': ' + error);
      }
    }

    pageToken = listed.nextPageToken || '';
    if (!pageToken) break;
  }

  const summary = 'Processed ' + importedMessages + ' message(s), saved ' + importedFiles + ' new file(s), skipped ' + alreadyImportedMessages + ' completed message(s), failed ' + failedMessages + '. Scanned ' + scanned + ' Gmail message(s).';
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

function bridgeJson(endpoint, payload) {
  const response = UrlFetchApp.fetch(ERP_BRIDGE_BASE + '/' + endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ERP_BRIDGE_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('ERP ' + endpoint + ' returned ' + status + ': ' + response.getContentText().slice(0, 250));
  }
  const result = JSON.parse(response.getContentText());
  if (!result.ok) throw new Error('ERP did not confirm ' + endpoint + '.');
  return result;
}

function gmailApi(path, params) {
  const url = GMAIL_API + path + (Object.keys(params).length ? '?' + toQuery(params) : '');
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Gmail API returned ' + status + ': ' + response.getContentText().slice(0, 250));
  }
  return response.getContentText() ? JSON.parse(response.getContentText()) : {};
}

function toQuery(params) {
  return Object.keys(params).map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
}

function collectParts(part, attachments, bodyParts, path) {
  const filename = (part.filename || '').trim();
  if (filename && part.body && (part.body.attachmentId || part.body.data)) {
    attachments.push({
      filename: filename,
      mimeType: part.mimeType || 'application/octet-stream',
      partKey: String(part.partId || path),
      attachmentId: part.body.attachmentId || '',
      data: part.body.data || ''
    });
  } else if (part.mimeType === 'text/plain' && part.body && part.body.data) {
    const bytes = Utilities.base64DecodeWebSafe(part.body.data);
    bodyParts.push(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
  }
  (part.parts || []).forEach(function (child, index) {
    collectParts(child, attachments, bodyParts, path + '.' + index);
  });
}
