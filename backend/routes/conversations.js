const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const CONVERSATIONS_DIR = path.join(__dirname, '../../conversations');
const INDEX_FILE = path.join(CONVERSATIONS_DIR, 'index.json');

async function ensureDir() {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

async function readIndex() {
  try {
    const data = await fs.readFile(INDEX_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeIndex(index) {
  await ensureDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

function generateId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function titleFromMessages(messages) {
  if (!messages || messages.length === 0) return 'New chat';
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser || !firstUser.content) return 'New chat';
  const trimmed = firstUser.content.trim();
  return trimmed.length > 50 ? trimmed.slice(0, 47) + '...' : trimmed;
}

// Serialize messages for storage (Date -> ISO string)
function serializeMessages(messages) {
  return (messages || []).map((m) => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  }));
}

// Restore messages from storage (ISO string -> Date)
function deserializeMessages(messages) {
  return (messages || []).map((m) => ({
    ...m,
    timestamp: typeof m.timestamp === 'string' ? new Date(m.timestamp) : m.timestamp,
  }));
}

// List conversations (id, title, model, updatedAt only)
router.get('/', async (req, res) => {
  try {
    const index = await readIndex();
    // Sort by updatedAt descending
    const sorted = index.slice().sort((a, b) => {
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      return tb - ta;
    });
    res.json({ conversations: sorted });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations', message: error.message });
  }
});

// Get one conversation (full messages)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const safeId = path.basename(id);
    if (safeId !== id || !id.startsWith('conv_')) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }
    const filePath = path.join(CONVERSATIONS_DIR, `${safeId}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    const conv = JSON.parse(data);
    conv.messages = deserializeMessages(conv.messages);
    res.json(conv);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    console.error('Error reading conversation:', e);
    res.status(500).json({ error: 'Failed to load conversation', message: e.message });
  }
});

// Create new conversation
router.post('/', async (req, res) => {
  try {
    const { title, model } = req.body || {};
    const id = generateId();
    const now = new Date().toISOString();
    const conversation = {
      id,
      title: title || 'New chat',
      model: model || '',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    await ensureDir();
    await fs.writeFile(
      path.join(CONVERSATIONS_DIR, `${id}.json`),
      JSON.stringify(conversation, null, 2)
    );
    const index = await readIndex();
    index.push({ id, title: conversation.title, model: conversation.model, updatedAt: now });
    await writeIndex(index);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation', message: error.message });
  }
});

// Update conversation (save messages, optional title/model)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const safeId = path.basename(id);
    if (safeId !== id || !id.startsWith('conv_')) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }
    const { title, messages, model } = req.body || {};
    const filePath = path.join(CONVERSATIONS_DIR, `${safeId}.json`);
    let conversation;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      conversation = JSON.parse(data);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      throw e;
    }
    const now = new Date().toISOString();
    if (messages !== undefined) {
      conversation.messages = serializeMessages(messages);
    }
    if (title !== undefined) conversation.title = title;
    if (model !== undefined) conversation.model = model;
    conversation.updatedAt = now;
    if (messages !== undefined && conversation.title === 'New chat') {
      conversation.title = titleFromMessages(messages);
    }
    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    const index = await readIndex();
    const entry = index.find((e) => e.id === id);
    if (entry) {
      entry.title = conversation.title;
      entry.model = conversation.model;
      entry.updatedAt = now;
      await writeIndex(index);
    }
    res.json({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      updatedAt: conversation.updatedAt,
      messageCount: (conversation.messages || []).length,
    });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Failed to update conversation', message: error.message });
  }
});

// Delete conversation
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const safeId = path.basename(id);
    if (safeId !== id || !id.startsWith('conv_')) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }
    const filePath = path.join(CONVERSATIONS_DIR, `${safeId}.json`);
    await fs.unlink(filePath).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    const index = await readIndex();
    const newIndex = index.filter((e) => e.id !== id);
    await writeIndex(newIndex);
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation', message: error.message });
  }
});

module.exports = router;
