/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAccessToken } from './firebase';

/**
 * Fetch files from Google Drive
 */
export async function listDriveFiles(): Promise<Array<{ id: string; name: string; mimeType: string; webViewLink?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,webViewLink)', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Drive API Error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Send an email via Gmail API
 * Note: Must be invoked only after user confirmation.
 */
export async function sendGmailMessage(to: string, subject: string, bodyText: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const messageParts = [
    `To: ${to}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    bodyText,
  ];
  const message = messageParts.join('\r\n');
  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API Error: ${res.statusText}`);
  }

  return true;
}

/**
 * List Google Tasks for Glam Squad Schedule
 */
export async function listGoogleTasks(): Promise<Array<{ id: string; title: string; status: string; due?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=10', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Tasks API Error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.items || [];
}

/**
 * Create a Google Task for appointment prep
 */
export async function createGoogleTask(title: string, notes?: string, dueDateIso?: string): Promise<any> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      notes: notes || 'Booked via Leish! Luxury Aesthetic Marketplace',
      due: dueDateIso,
    })
  });

  if (!res.ok) {
    throw new Error(`Tasks API Error: ${res.statusText}`);
  }

  return res.json();
}

/**
 * Fetch Google Contacts
 */
export async function listGoogleContacts(): Promise<Array<{ resourceName: string; displayName?: string; email?: string; phone?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=10', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`People API Error: ${res.statusText}`);
  }

  const data = await res.json();
  return (data.connections || []).map((conn: any) => ({
    resourceName: conn.resourceName,
    displayName: conn.names?.[0]?.displayName || 'Unnamed Contact',
    email: conn.emailAddresses?.[0]?.value,
    phone: conn.phoneNumbers?.[0]?.value,
  }));
}

/**
 * Create a Google Document (e.g., Bridal Contract, Beauty Blueprint, Face Chart Specification)
 */
export async function createGoogleDoc(title: string, initialContent?: string): Promise<{ documentId: string; title: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  // 1. Create document
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Docs API Error: ${createRes.statusText}`);
  }

  const docData = await createRes.json();
  const documentId = docData.documentId;

  // 2. Insert initial text if provided
  if (initialContent) {
    const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: initialContent,
            },
          },
        ],
      }),
    });
    if (!updateRes.ok) {
      console.warn('Could not populate doc content automatically:', updateRes.statusText);
    }
  }

  return { documentId, title };
}

/**
 * List Google Docs in Drive
 */
export async function listGoogleDocs(): Promise<Array<{ id: string; name: string; webViewLink?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.document' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&fields=files(id,name,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Drive Docs Query Error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Create a Google Form (e.g., Bridal Consultation & Skin Allergy Intake Questionnaire)
 */
export async function createGoogleForm(title: string, documentTitle?: string): Promise<{ formId: string; responderUri: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://forms.googleapis.com/v1/forms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      info: {
        title: title,
        documentTitle: documentTitle || title,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Forms API Error: ${res.statusText}`);
  }

  const formData = await res.json();
  return {
    formId: formData.formId,
    responderUri: formData.responderUri,
  };
}

/**
 * List Google Forms in Drive
 */
export async function listGoogleForms(): Promise<Array<{ id: string; name: string; webViewLink?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.form' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&fields=files(id,name,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Drive Forms Query Error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * List Google Chat Spaces
 */
export async function listGoogleChatSpaces(): Promise<Array<{ name: string; displayName?: string; type?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://chat.googleapis.com/v1/spaces?pageSize=10', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Chat API Error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.spaces || [];
}

/**
 * Send message to Google Chat space
 */
export async function sendGoogleChatMessage(spaceName: string, text: string): Promise<any> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Chat API Error: ${res.statusText}`);
  }

  return res.json();
}

/**
 * List Google Classroom Courses (for MUA Masterclass Academy)
 */
export async function listClassroomCourses(): Promise<Array<{ id: string; name: string; section?: string; alternateLink?: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://classroom.googleapis.com/v1/courses?pageSize=10', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Classroom API Error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.courses || [];
}

/**
 * Create Google Classroom Course
 */
export async function createClassroomCourse(name: string, section?: string, descriptionHeading?: string): Promise<any> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace');

  const res = await fetch('https://classroom.googleapis.com/v1/courses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      section: section || 'Beauty Masterclass Cohort',
      descriptionHeading: descriptionHeading || 'Leish! Professional MUA Masterclass',
      ownerId: 'me',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Classroom API Error: ${res.statusText}`);
  }

  return res.json();
}
