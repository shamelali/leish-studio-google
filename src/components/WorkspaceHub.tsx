/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  initAuth, 
  googleSignIn, 
  logoutFirebase, 
  getAccessToken 
} from '../lib/firebase';
import { 
  listDriveFiles, 
  sendGmailMessage, 
  listGoogleTasks, 
  createGoogleTask, 
  listGoogleContacts,
  createGoogleDoc,
  listGoogleDocs,
  createGoogleForm,
  listGoogleForms,
  listGoogleChatSpaces,
  sendGoogleChatMessage,
  listClassroomCourses,
  createClassroomCourse
} from '../lib/workspace';
import { User } from 'firebase/auth';
import { 
  Mail, 
  HardDrive, 
  CheckSquare, 
  Users, 
  Sparkles, 
  LogOut, 
  AlertCircle, 
  CheckCircle2, 
  Send, 
  ExternalLink,
  Loader2,
  FileText,
  FileCheck,
  MessageSquare,
  GraduationCap,
  Search,
  FolderOpen,
  Plus
} from 'lucide-react';

interface WorkspaceHubProps {
  onClose?: () => void;
}

export default function WorkspaceHub({ onClose }: WorkspaceHubProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Active integration tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'gmail' | 'tasks' | 'drive' | 'contacts' | 'docs' | 'forms' | 'chat' | 'classroom'>('overview');

  // Workspace data states
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [chatSpaces, setChatSpaces] = useState<any[]>([]);
  const [classroomCourses, setClassroomCourses] = useState<any[]>([]);

  // Email form state
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('Leish! Luxury Makeup Booking Confirmation');
  const [emailBody, setEmailBody] = useState('Dear Client,\n\nYour luxury makeup appointment has been reserved on Leish! Aesthetic Marketplace.\n\nAtelier: Maison Leish\nArtist: Jean-Marc Laurent\nService: Royal Red Carpet Artistry\n\nWe look forward to curating your camera-ready glow.');
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);

  // Task form state
  const [taskTitle, setTaskTitle] = useState('Sanitize & Pack 4K Airbrush Mobile Kit');
  const [taskNotes, setTaskNotes] = useState('Prep shade match vials, Charlotte Tilbury Setting Spray, and fresh silicone sponges.');

  // Doc form state
  const [docTitle, setDocTitle] = useState('Bridal Face Chart & Contract Agreement - 2026');
  const [docContent, setDocContent] = useState('LEISH! LUXURY ARTISTRY AGREEMENT\n\nClient: Haute Couture Bride\nLead MUA: Jean-Marc Laurent\nTechnique: 4K Airbrush Skin Prep + Waterproof Silicone Formula\n\n1. TIMELINE & ON-LOCATION SCHEDULE\n07:00 AM - Skin Prep & Hydration Mask\n08:15 AM - Airbrush Base & Highlight\n09:30 AM - Veil Placement & Touch-up Kit Handover\n\n2. SANITATION STANDARDS\nAll brushes sterilized with hospital-grade surfactant. Single-use spoolies only.');

  // Form form state
  const [formTitle, setFormTitle] = useState('Leish! Bridal Beauty Consultation & Allergy Intake');

  // Chat message state
  const [chatSpaceName, setChatSpaceName] = useState('');
  const [chatMessageText, setChatMessageText] = useState('Glam squad is en route to bridal suite 402 with lighting kits.');

  // Classroom course state
  const [courseName, setCourseName] = useState('Mastering 4K Airbrush Artistry & Cut Creases');
  const [courseSection, setCourseSection] = useState('Spring Masterclass Cohort');

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setHasToken(Boolean(token));
      },
      () => {
        setCurrentUser(null);
        setHasToken(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setHasToken(true);
        setStatusMessage({ text: `Connected as ${res.user.email}`, type: 'success' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Google Sign-In failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logoutFirebase();
    setCurrentUser(null);
    setHasToken(false);
    setStatusMessage({ text: 'Signed out from Google Workspace', type: 'success' });
  };

  const loadDriveFiles = async () => {
    setLoading(true);
    try {
      const files = await listDriveFiles();
      setDriveFiles(files);
    } catch (err: any) {
      setStatusMessage({ text: `Drive: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const taskItems = await listGoogleTasks();
      setTasks(taskItems);
    } catch (err: any) {
      setStatusMessage({ text: `Tasks: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async () => {
    setLoading(true);
    try {
      const contactItems = await listGoogleContacts();
      setContacts(contactItems);
    } catch (err: any) {
      setStatusMessage({ text: `Contacts: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadDocs = async () => {
    setLoading(true);
    try {
      const docItems = await listGoogleDocs();
      setDocs(docItems);
    } catch (err: any) {
      setStatusMessage({ text: `Docs: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadForms = async () => {
    setLoading(true);
    try {
      const formItems = await listGoogleForms();
      setForms(formItems);
    } catch (err: any) {
      setStatusMessage({ text: `Forms: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadChatSpaces = async () => {
    setLoading(true);
    try {
      const spaces = await listGoogleChatSpaces();
      setChatSpaces(spaces);
      if (spaces.length > 0 && !chatSpaceName) {
        setChatSpaceName(spaces[0].name);
      }
    } catch (err: any) {
      setStatusMessage({ text: `Google Chat: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadClassroom = async () => {
    setLoading(true);
    try {
      const courses = await listClassroomCourses();
      setClassroomCourses(courses);
    } catch (err: any) {
      setStatusMessage({ text: `Classroom: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailWithConfirmation = async () => {
    setShowEmailConfirm(false);
    setLoading(true);
    try {
      await sendGmailMessage(recipient || currentUser?.email || '', subject, emailBody);
      setStatusMessage({ text: `Email dispatched successfully to ${recipient || currentUser?.email}`, type: 'success' });
    } catch (err: any) {
      setStatusMessage({ text: `Gmail dispatch failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async () => {
    if (!taskTitle.trim()) return;
    setLoading(true);
    try {
      await createGoogleTask(taskTitle, taskNotes);
      setStatusMessage({ text: 'Glam Squad Task scheduled in Google Tasks!', type: 'success' });
      setTaskTitle('');
      loadTasks();
    } catch (err: any) {
      setStatusMessage({ text: `Task creation failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDoc = async () => {
    if (!docTitle.trim()) return;
    setLoading(true);
    try {
      const res = await createGoogleDoc(docTitle, docContent);
      setStatusMessage({ text: `Google Document "${res.title}" created successfully!`, type: 'success' });
      loadDocs();
    } catch (err: any) {
      setStatusMessage({ text: `Doc creation failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateForm = async () => {
    if (!formTitle.trim()) return;
    setLoading(true);
    try {
      const res = await createGoogleForm(formTitle);
      setStatusMessage({ text: `Google Form created! Responder URL: ${res.responderUri}`, type: 'success' });
      loadForms();
    } catch (err: any) {
      setStatusMessage({ text: `Form creation failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatSpaceName || !chatMessageText.trim()) return;
    setLoading(true);
    try {
      await sendGoogleChatMessage(chatSpaceName, chatMessageText);
      setStatusMessage({ text: 'Message posted to Google Chat space!', type: 'success' });
      setChatMessageText('');
    } catch (err: any) {
      setStatusMessage({ text: `Chat message failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCourse = async () => {
    if (!courseName.trim()) return;
    setLoading(true);
    try {
      await createClassroomCourse(courseName, courseSection);
      setStatusMessage({ text: `Masterclass Course "${courseName}" established in Google Classroom!`, type: 'success' });
      loadClassroom();
    } catch (err: any) {
      setStatusMessage({ text: `Classroom creation failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-fg">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-line bg-canvas">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-accent/20 border border-accent-soft/40 text-fg text-[10px] font-mono">
            <Sparkles className="h-3 w-3 text-accent-text" />
            <span>Google Workspace Enterprise Suite & Firebase Integrated</span>
          </div>
          <h2 className="font-serif text-xl font-bold text-fg">
            MUA & Studio Workspace Operations
          </h2>
          <p className="text-xs text-fg-muted">
            Directly connect Google Drive, Gmail, Docs, Forms, Tasks, Contacts, Chat, and Classroom to empower high-end bridal agreements, shade formulas, and mobile dispatch.
          </p>
        </div>

        <div>
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="block text-xs font-mono font-bold text-fg">
                  {currentUser.displayName || currentUser.email}
                </span>
                <span className="text-[10px] text-success font-mono flex items-center justify-end gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Google Workspace Connected</span>
                </span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 rounded-xl border border-line hover:bg-surface text-fg-muted hover:text-fg transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-white hover:bg-secondary text-canvas font-sans font-semibold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{loading ? 'Connecting...' : 'Sign in with Google Workspace'}</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 ${
          statusMessage.type === 'success' 
            ? 'bg-success-surface/40 border-success-border text-success'
            : 'bg-danger-surface/40 border-danger-border text-danger'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Horizontal Tabs */}
      <div className="flex border-b border-line space-x-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'overview' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          Overview Hub
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('gmail');
            if (currentUser && !recipient) setRecipient(currentUser.email || '');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'gmail' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          <span>Gmail</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('drive');
            if (currentUser) loadDriveFiles();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'drive' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <HardDrive className="h-3.5 w-3.5" />
          <span>Drive & Picker</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('docs');
            if (currentUser) loadDocs();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'docs' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Google Docs</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('forms');
            if (currentUser) loadForms();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'forms' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <FileCheck className="h-3.5 w-3.5" />
          <span>Google Forms</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('tasks');
            if (currentUser) loadTasks();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'tasks' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          <span>Tasks & Prep</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('contacts');
            if (currentUser) loadContacts();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'contacts' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Contacts</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('chat');
            if (currentUser) loadChatSpaces();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'chat' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Google Chat</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('classroom');
            if (currentUser) loadClassroom();
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'classroom' ? 'bg-primary text-on-primary' : 'text-fg-muted hover:text-fg'
          }`}
        >
          <GraduationCap className="h-3.5 w-3.5" />
          <span>Classroom</span>
        </button>
      </div>

      {/* TAB: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-danger font-mono text-xs font-bold uppercase tracking-wider">
              <Mail className="h-4 w-4" />
              <span>Gmail Artistry Dispatch</span>
            </div>
            <p className="text-xs text-fg-muted">
              Generate and send official Leish! Couture Booking confirmations, shade-matching guidelines, and wedding day morning schedules.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('gmail')}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Compose Email</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-info font-mono text-xs font-bold uppercase tracking-wider">
              <HardDrive className="h-4 w-4" />
              <span>Google Drive & Picker</span>
            </div>
            <p className="text-xs text-fg-muted">
              Access moodboard exports, bridal contracts, and camera lighting reference files stored in Google Drive.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('drive');
                if (currentUser) loadDriveFiles();
              }}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Browse Drive Assets</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-info font-mono text-xs font-bold uppercase tracking-wider">
              <FileText className="h-4 w-4" />
              <span>Google Docs Artistry</span>
            </div>
            <p className="text-xs text-fg-muted">
              Draft bridal contract agreements, on-location timelines, and face chart shade blueprints directly into Google Docs.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('docs');
                if (currentUser) loadDocs();
              }}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Create / View Docs</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-info font-mono text-xs font-bold uppercase tracking-wider">
              <FileCheck className="h-4 w-4" />
              <span>Google Forms Intake</span>
            </div>
            <p className="text-xs text-fg-muted">
              Generate client skin type, allergy declaration, and bridal party headcounts into Google Forms.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('forms');
                if (currentUser) loadForms();
              }}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Generate Form</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-accent-text font-mono text-xs font-bold uppercase tracking-wider">
              <CheckSquare className="h-4 w-4" />
              <span>Google Tasks (Prep)</span>
            </div>
            <p className="text-xs text-fg-muted">
              Schedule mobile kit sanitization, Temptu airbrush battery charges, and bridal party countdown milestones in Google Tasks.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('tasks');
                if (currentUser) loadTasks();
              }}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View & Add Tasks</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-success font-mono text-xs font-bold uppercase tracking-wider">
              <Users className="h-4 w-4" />
              <span>Google Contacts</span>
            </div>
            <p className="text-xs text-fg-muted">
              Sync your client directory, bridal party contacts, and emergency wedding coordinators straight from Google Contacts.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('contacts');
                if (currentUser) loadContacts();
              }}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View Contacts</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-info font-mono text-xs font-bold uppercase tracking-wider">
              <MessageSquare className="h-4 w-4" />
              <span>Google Chat Dispatch</span>
            </div>
            <p className="text-xs text-fg-muted">
              Post instant dispatch pings and arrival notifications to your atelier's Google Chat team spaces.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('chat');
                if (currentUser) loadChatSpaces();
              }}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Open Chat Dispatch</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          <div className="p-5 rounded-2xl border border-line bg-canvas space-y-3">
            <div className="flex items-center gap-2 text-warning font-mono text-xs font-bold uppercase tracking-wider">
              <GraduationCap className="h-4 w-4" />
              <span>Google Classroom Academy</span>
            </div>
            <p className="text-xs text-fg-muted">
              Manage hands-on masterclass student cohorts, technique curricula, and certificate milestones.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('classroom');
                if (currentUser) loadClassroom();
              }}
              className="text-xs font-mono font-bold text-fg hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Academy Classes</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* TAB: Gmail */}
      {activeTab === 'gmail' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Send Booking Confirmation via Gmail
            </h3>
            <span className="text-[10px] font-mono text-fg-muted">
              Workspace API · Gmail
            </span>
          </div>

          {!currentUser ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-xs text-fg-muted">Please sign in with Google to send emails.</p>
              <button
                type="button"
                onClick={handleSignIn}
                className="px-4 py-2 rounded-xl bg-white text-canvas font-semibold text-xs inline-flex items-center gap-2"
              >
                Sign in with Google
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-fg-muted mb-1">Recipient Client Email</label>
                <input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full rounded-xl border border-accent-soft bg-panel-mid px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-fg-muted mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-accent-soft bg-panel-mid px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-fg-muted mb-1">Message Body</label>
                <textarea
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full rounded-xl border border-accent-soft bg-panel-mid px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none font-mono"
                />
              </div>

              {showEmailConfirm ? (
                <div className="p-4 rounded-xl border border-warning-border bg-warning-surface/40 space-y-3">
                  <div className="flex items-center gap-2 text-accent-text text-xs font-bold font-mono">
                    <AlertCircle className="h-4 w-4" />
                    <span>Confirm sending email from {currentUser.email}?</span>
                  </div>
                  <p className="text-xs text-fg-muted">
                    This will transmit this message to <strong>{recipient || currentUser.email}</strong> via Gmail API.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSendEmailWithConfirmation}
                      disabled={loading}
                      className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-1.5 cursor-pointer"
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      <span>Yes, Send Email</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmailConfirm(false)}
                      className="px-4 py-1.5 rounded-lg border border-line text-xs text-fg-muted hover:text-fg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEmailConfirm(true)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-2 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Review & Dispatch Confirmation</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: Google Drive */}
      {activeTab === 'drive' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Google Drive Files & Lookbooks
            </h3>
            <button
              type="button"
              onClick={loadDriveFiles}
              className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
            >
              Refresh Drive
            </button>
          </div>

          {!currentUser ? (
            <p className="text-xs text-fg-muted">Please sign in with Google to browse Drive assets.</p>
          ) : (
            <div className="space-y-3">
              {driveFiles.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-line rounded-xl text-xs text-fg-muted space-y-2">
                  <FolderOpen className="h-6 w-6 text-fg-dim mx-auto" />
                  <p>No drive files listed yet. Click Refresh to synchronize recent Drive files.</p>
                  <button
                    type="button"
                    onClick={loadDriveFiles}
                    className="px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-bold"
                  >
                    Sync Drive Files
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                  {driveFiles.map((file) => (
                    <div key={file.id} className="p-3 flex items-center justify-between bg-canvas text-xs">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-info" />
                        <span className="text-fg font-medium">{file.name}</span>
                      </div>
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-mono text-fg hover:underline flex items-center gap-1"
                        >
                          <span>Open in Drive</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: Google Docs */}
      {activeTab === 'docs' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Google Docs Artistry Contracts & Face Charts
            </h3>
            <button
              type="button"
              onClick={loadDocs}
              className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
            >
              Refresh Docs
            </button>
          </div>

          {!currentUser ? (
            <p className="text-xs text-fg-muted">Please sign in with Google to create or browse Google Docs.</p>
          ) : (
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-line bg-panel-mid space-y-3">
                <span className="text-xs font-mono font-bold text-fg uppercase">Create New Google Document</span>
                <div>
                  <label className="block text-xs font-mono text-fg-muted mb-1">Document Title</label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-fg-muted mb-1">Initial Text / Agreement Terms</label>
                  <textarea
                    rows={4}
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateDoc}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Generate Document in Google Docs</span>
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-fg-muted block">Recent Google Docs</span>
                {docs.length === 0 ? (
                  <p className="text-xs text-fg-dim italic">No documents loaded yet. Click Refresh Docs.</p>
                ) : (
                  <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                    {docs.map((d) => (
                      <div key={d.id} className="p-3 flex items-center justify-between bg-canvas text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-info" />
                          <span className="text-fg font-medium">{d.name}</span>
                        </div>
                        {d.webViewLink && (
                          <a
                            href={d.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-fg hover:underline flex items-center gap-1"
                          >
                            <span>Open Doc</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Google Forms */}
      {activeTab === 'forms' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Google Forms Bridal & Skin Consultation
            </h3>
            <button
              type="button"
              onClick={loadForms}
              className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
            >
              Refresh Forms
            </button>
          </div>

          {!currentUser ? (
            <p className="text-xs text-fg-muted">Please sign in with Google to create or view Google Forms.</p>
          ) : (
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-line bg-panel-mid space-y-3">
                <span className="text-xs font-mono font-bold text-fg uppercase">Create New Google Form</span>
                <div>
                  <label className="block text-xs font-mono text-fg-muted mb-1">Form Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateForm}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Generate Form via Forms API</span>
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-fg-muted block">Existing Forms in Drive</span>
                {forms.length === 0 ? (
                  <p className="text-xs text-fg-dim italic">No forms loaded yet. Click Refresh Forms.</p>
                ) : (
                  <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                    {forms.map((f) => (
                      <div key={f.id} className="p-3 flex items-center justify-between bg-canvas text-xs">
                        <div className="flex items-center gap-2">
                          <FileCheck className="h-4 w-4 text-info" />
                          <span className="text-fg font-medium">{f.name}</span>
                        </div>
                        {f.webViewLink && (
                          <a
                            href={f.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-fg hover:underline flex items-center gap-1"
                          >
                            <span>Open Form</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Google Tasks */}
      {activeTab === 'tasks' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Google Tasks (Glam Squad & Kit Prep)
            </h3>
            <button
              type="button"
              onClick={loadTasks}
              className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
            >
              Refresh Tasks
            </button>
          </div>

          {!currentUser ? (
            <p className="text-xs text-fg-muted">Please sign in with Google to manage tasks.</p>
          ) : (
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-line bg-panel-mid space-y-3">
                <span className="text-xs font-mono font-bold text-fg uppercase">Schedule New Task</span>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title..."
                  className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                />
                <input
                  type="text"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Notes or shade requirements..."
                  className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddTask}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add to Google Tasks</span>
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-fg-muted block">Current Tasks in Default List</span>
                {tasks.length === 0 ? (
                  <p className="text-xs text-fg-dim italic">No tasks returned. Click Refresh Tasks.</p>
                ) : (
                  <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                    {tasks.map((t) => (
                      <div key={t.id} className="p-3 flex items-center justify-between bg-canvas text-xs">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-accent-text" />
                          <span className="text-fg font-medium">{t.title}</span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface text-fg-muted">
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Google Contacts */}
      {activeTab === 'contacts' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Google Contacts Directory
            </h3>
            <button
              type="button"
              onClick={loadContacts}
              className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
            >
              Refresh Contacts
            </button>
          </div>

          {!currentUser ? (
            <p className="text-xs text-fg-muted">Please sign in with Google to view contacts.</p>
          ) : (
            <div className="space-y-2">
              {contacts.length === 0 ? (
                <p className="text-xs text-fg-muted italic py-4">No contacts loaded yet or none returned. Click Refresh.</p>
              ) : (
                <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                  {contacts.map((c, i) => (
                    <div key={i} className="p-3 flex items-center justify-between bg-canvas text-xs">
                      <div>
                        <span className="font-bold text-fg block">{c.displayName}</span>
                        <span className="text-[11px] font-mono text-fg-dim">{c.email || c.phone || 'No email/phone'}</span>
                      </div>
                      {c.email && (
                        <button
                          type="button"
                          onClick={() => {
                            setRecipient(c.email);
                            setActiveTab('gmail');
                          }}
                          className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
                        >
                          Send Email
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: Google Chat */}
      {activeTab === 'chat' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Google Chat Glam Squad Spaces
            </h3>
            <button
              type="button"
              onClick={loadChatSpaces}
              className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
            >
              Refresh Spaces
            </button>
          </div>

          {!currentUser ? (
            <p className="text-xs text-fg-muted">Please sign in with Google to connect to Google Chat.</p>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-line bg-panel-mid space-y-3">
                <span className="text-xs font-mono font-bold text-fg uppercase">Post to Chat Space</span>
                <div>
                  <label className="block text-xs font-mono text-fg-muted mb-1">Space Identifier</label>
                  {chatSpaces.length > 0 ? (
                    <select
                      value={chatSpaceName}
                      onChange={(e) => setChatSpaceName(e.target.value)}
                      className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                    >
                      {chatSpaces.map(s => (
                        <option key={s.name} value={s.name}>{s.displayName || s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={chatSpaceName}
                      onChange={(e) => setChatSpaceName(e.target.value)}
                      placeholder="spaces/XXXXXX"
                      className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-mono text-fg-muted mb-1">Dispatch Message</label>
                  <input
                    type="text"
                    value={chatMessageText}
                    onChange={(e) => setChatMessageText(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendChatMessage}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-2 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Send to Google Chat</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Google Classroom */}
      {activeTab === 'classroom' && (
        <div className="p-5 rounded-2xl border border-line bg-canvas space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold text-fg">
              Google Classroom (Masterclass Academy)
            </h3>
            <button
              type="button"
              onClick={loadClassroom}
              className="text-[11px] font-mono text-fg hover:underline cursor-pointer"
            >
              Refresh Courses
            </button>
          </div>

          {!currentUser ? (
            <p className="text-xs text-fg-muted">Please sign in with Google to manage Classroom courses.</p>
          ) : (
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-line bg-panel-mid space-y-3">
                <span className="text-xs font-mono font-bold text-fg uppercase">Create New Masterclass Course</span>
                <div>
                  <label className="block text-xs font-mono text-fg-muted mb-1">Masterclass Title</label>
                  <input
                    type="text"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-fg-muted mb-1">Cohort Section</label>
                  <input
                    type="text"
                    value={courseSection}
                    onChange={(e) => setCourseSection(e.target.value)}
                    className="w-full rounded-xl border border-accent-soft bg-canvas px-3 py-2 text-xs text-fg focus:border-accent-strong focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateCourse}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Course in Google Classroom</span>
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-fg-muted block">Enrolled / Active Courses</span>
                {classroomCourses.length === 0 ? (
                  <p className="text-xs text-fg-dim italic">No courses found. Click Refresh Courses.</p>
                ) : (
                  <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                    {classroomCourses.map((c) => (
                      <div key={c.id} className="p-3 flex items-center justify-between bg-canvas text-xs">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-warning" />
                          <div>
                            <span className="text-fg font-medium block">{c.name}</span>
                            <span className="text-[10px] text-fg-muted font-mono">{c.section}</span>
                          </div>
                        </div>
                        {c.alternateLink && (
                          <a
                            href={c.alternateLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-fg hover:underline flex items-center gap-1"
                          >
                            <span>Open Classroom</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
