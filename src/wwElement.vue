<template>
  <!-- Chat Wrapper with customizable height -->
  <div class="chat-wrapper" :style="{ height: content.height || '550px' }">
    <!-- Header (optional – you can hide via prop) -->
    <div class="chat-header" v-if="showHeader">
      <button class="back-btn" @click="$emit('back')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="header-info">
        <h3>{{ headerTitle }}</h3>
        <span class="member-count" v-if="memberCount">{{ memberCount }} {{ $t('members') }}</span>
      </div>
      <button class="invite-btn" @click="$emit('invite')">+ {{ $t('invite member') }}</button>
    </div>

    <!-- Messages -->
    <div class="messages-container" ref="messagesContainer">
      <div
        v-for="message in messages"
        :key="message.id"
        :class="['message-row', { 'own': message.user_id === currentUserId }]"
      >
        <!-- Avatar (left) -->
        <img
          v-if="!isOwn(message)"
          class="avatar"
          :src="message.avatar_url || defaultAvatar"
          alt="avatar"
        />

        <div class="message-bubble-wrapper">
          <!-- Username + relative time -->
          <div class="meta">
            <span class="username">{{ message.username }}</span>
            <span class="timestamp">{{ formatRelativeTime(message.created_at) }}</span>
          </div>
          <!-- Content -->
          <div
            class="message-bubble"
            :class="{ 'own-bubble': isOwn(message) }"
            v-html="parseMessage(message.content)"
          ></div>
        </div>

        <!-- Avatar (right) for own messages -->
        <img
          v-if="isOwn(message)"
          class="avatar own-avatar"
          :src="message.avatar_url || defaultAvatar"
          alt="avatar"
        />
      </div>
    </div>

    <!-- Input -->
    <div class="input-container">
      <!-- Mention dropdown -->
      <div
        v-if="showMentionMenu"
        class="mention-menu"
        :style="mentionMenuStyle"
      >
        <div
          v-for="item in filteredMentionItems"
          :key="item.id"
          class="mention-item"
          @click="selectMention(item)"
        >
          <span class="trigger">{{ currentTrigger }}</span>{{ item.label }}
        </div>
      </div>

      <!-- Editable div + send -->
      <div class="input-wrapper">
        <div
          ref="messageInput"
          class="message-input"
          contenteditable="true"
          :placeholder="$t('Type a message…')"
          @input="handleInput"
          @keydown="handleKeydown"
          @paste="handlePaste"
        ></div>
        <button class="send-button" :disabled="!canSend" @click="sendMessage">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { createClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export default {
  name: 'RealtimeChat',
  props: {
    content: { type: Object, default: () => ({}) }
  },
  data() {
    return {
      messages: [],
      showMentionMenu: false,
      currentTrigger: null,
      mentionSearch: '',
      mentionStartIndex: -1,
      filteredMentionItems: [],
      mentionMenuStyle: {},
      supabase: null,
      channel: null,
      defaultAvatar: 'https://placehold.co/40x40/png',
      isConnected: false
    }
  },
  computed: {
    // Derived settings from content prop
    supabaseUrl() {
      return this.content.supabaseUrl
    },
    supabaseKey() {
      return this.content.supabaseKey
    },
    tableName() {
      return this.content.tableName || 'messages'
    },
    channelId() {
      return this.content.channelId
    },
    currentUserId() {
      return this.content.currentUserId
    },
    currentUsername() {
      return this.content.currentUsername
    },
    mentionTriggers() {
      return this.content.mentionTriggers || {
        '@': { items: [], className: 'm-user' },
        '#': { items: [], className: 'm-tag' }
      }
    },
    showHeader() {
      return this.content.showHeader !== false
    },
    headerTitle() {
      return this.content.headerTitle || 'Direct Chat'
    },
    memberCount() {
      return this.content.memberCount || null
    },
    canSend() {
      return this.isConnected && (this.$refs.messageInput?.innerText.trim().length > 0)
    }
  },
  watch: {
    supabaseUrl() { this.reconnect() },
    supabaseKey() { this.reconnect() },
    channelId()   { this.reconnect() }
  },
  mounted() {
    this.initSupabase()
  },
  beforeUnmount() {
    this.disconnect()
  },
  methods: {
    /* ---------- Supabase ---------- */
    async initSupabase() {
      if (!this.supabaseUrl || !this.supabaseKey) return
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey)
      await this.loadMessages()
      this.subscribe()
      this.isConnected = true
    },
    async loadMessages() {
      if (!this.supabase || !this.channelId) return
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('channel_id', this.channelId)
        .order('created_at', { ascending: true })
      if (error) console.error(error)
      this.messages = data || []
      this.$nextTick(() => this.scrollToBottom())
    },
    subscribe() {
      if (!this.supabase || !this.channelId) return
      if (this.channel) this.supabase.removeChannel(this.channel)
      this.channel = this.supabase
        .channel(`messages:${this.channelId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: this.tableName,
          filter: `channel_id=eq.${this.channelId}`
        }, ({ new: m }) => {
          if (!this.messages.find(x => x.id === m.id)) {
            this.messages.push(m)
            this.$nextTick(() => this.scrollToBottom())
          }
        })
        .subscribe()
    },
    async sendMessage() {
      const raw = this.$refs.messageInput.innerText.trim()
      if (!raw) return
      const message = {
        content: raw,
        user_id: this.currentUserId,
        username: this.currentUsername,
        avatar_url: this.content.currentAvatarUrl || '',
        channel_id: this.channelId,
        created_at: new Date().toISOString()
      }
      const { error } = await this.supabase.from(this.tableName).insert([message])
      if (error) console.error(error)
      this.$refs.messageInput.innerText = ''
    },
    disconnect() {
      if (this.channel) this.supabase.removeChannel(this.channel)
      this.isConnected = false
    },
    reconnect() {
      this.disconnect()
      this.initSupabase()
    },

    /* ---------- Helpers ---------- */
    isOwn(m) { return m.user_id === this.currentUserId },
    scrollToBottom() {
      const c = this.$refs.messagesContainer
      c && (c.scrollTop = c.scrollHeight)
    },
    parseMessage(txt) {
      let html = this.escape(txt)
      Object.keys(this.mentionTriggers).forEach(t => {
        const cls = this.mentionTriggers[t].className
        const rgx = new RegExp(`\\${t}(\\w+)`, 'g')
        html = html.replace(rgx, `<span class="${cls}">${t}$1</span>`) 
      })
      return html.replace(/\n/g, '<br/>')
    },
    escape(str) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
      return str.replace(/[&<>"']/g, ch => map[ch])
    },
    formatRelativeTime(ts) {
      return dayjs(ts).fromNow()
    },

    /* ---------- Input / Mentions ---------- */
    handleInput(e) {
      const text = e.target.innerText
      const pos = this.getCaretPos(e.target)
      this.detectMention(text, pos)
    },
    handleKeydown(e) {
      if (this.showMentionMenu) {
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) e.preventDefault()
        if (e.key === 'Enter' && this.filteredMentionItems.length) {
          this.selectMention(this.filteredMentionItems[0])
        }
        if (e.key === 'Escape') this.closeMentionMenu()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); this.sendMessage()
      }
    },
    handlePaste(e) {
      e.preventDefault(); const t = e.clipboardData.getData('text/plain'); document.execCommand('insertText', false, t)
    },

    detectMention(text, caret) {
      const triggers = Object.keys(this.mentionTriggers)
      let found = false
      for (const t of triggers) {
        const idx = text.lastIndexOf(t, caret - 1)
        if (idx !== -1) {
          const after = text.substring(idx + 1, caret)
          if (!after.includes(' ') && !after.includes('\n')) {
            found = true
            this.currentTrigger = t
            this.mentionSearch = after
            this.mentionStartIndex = idx
            this.updateMentionMenu()
            break
          }
        }
      }
      if (!found) this.closeMentionMenu()
    },
    updateMentionMenu() {
      const items = this.mentionTriggers[this.currentTrigger]?.items || []
      this.filteredMentionItems = items.filter(i => i.label.toLowerCase().includes(this.mentionSearch.toLowerCase()))
      if (this.filteredMentionItems.length) {
        this.showMentionMenu = true
        this.$nextTick(() => this.setMentionMenuPos())
      } else { this.closeMentionMenu() }
    },
    setMentionMenuPos() {
      const el = this.$refs.messageInput; if (!el) return
      const rect = el.getBoundingClientRect()
      this.mentionMenuStyle = { top: `${rect.bottom + 6}px`, left: `${rect.left}px` }
    },
    selectMention(item) {
      const input = this.$refs.messageInput
      const txt = input.innerText
      const before = txt.substring(0, this.mentionStartIndex)
      const after = txt.substring(this.mentionStartIndex + this.mentionSearch.length + 1)
      const mentionTxt = `${this.currentTrigger}${item.value} `
      const newText = before + mentionTxt + after
      input.innerText = newText
      this.setCaretPos(input, before.length + mentionTxt.length)
      this.closeMentionMenu()
    },
    closeMentionMenu() { this.showMentionMenu = false },

    /* ---------- Caret helpers ---------- */
    getCaretPos(el) {
      const sel = window.getSelection(); if (!sel.rangeCount) return 0
      const range = sel.getRangeAt(0)
      const pre = range.cloneRange(); pre.selectNodeContents(el); pre.setEnd(range.endContainer, range.endOffset)
      return pre.toString().length
    },
    setCaretPos(el, pos) {
      const range = document.createRange(); const sel = window.getSelection()
      if (!el.childNodes.length) el.appendChild(document.createTextNode(''))
      range.setStart(el.firstChild, Math.min(pos, el.firstChild.length))
      range.collapse(true); sel.removeAllRanges(); sel.addRange(range); el.focus()
    }
  }
}
</script>

<style scoped>
/* --- Layout --- */
.chat-wrapper { width: 100%; height: 100%; display: flex; flex-direction: column; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.chat-header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid #e5e7eb; background: #fafafa; }
.back-btn, .invite-btn { background: transparent; border: none; color: #6b7280; font-weight: 500; cursor: pointer; padding: 4px 6px; }
.invite-btn { margin-left: auto; }
.header-info h3 { font-size: 14px; font-weight: 600; margin: 0; }
.member-count { font-size: 12px; color: #9ca3af; }

.messages-container { flex: 1; overflow-y: auto; padding: 18px 16px; background: #f9f9f9; }

.message-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 16px; }
.message-row.own { flex-direction: row-reverse; }

.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.own-avatar { margin-left: 8px; }

.message-bubble-wrapper { max-width: 74%; display: flex; flex-direction: column; }
.meta { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 2px; color: #6b7280; }
.username { font-weight: 600; color: #111827; }
.timestamp { font-size: 11px; }

.message-bubble { padding: 10px 14px; background: #fff; border-radius: 8px; line-height: 1.4; word-wrap: break-word; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
.own-bubble { background: #dcfce7; }

/* Mentions */
.m-user { color: #c026d3; font-weight: 600; background: rgba(192,38,211,.1); padding: 0 3px; border-radius: 3px; cursor: pointer; }
.m-tag  { color: #0ea5e9; font-weight: 600; background: rgba(14,165,233,.1); padding: 0 3px; border-radius: 3px; cursor: pointer; }

/* Input */
.input-container { border-top: 1px solid #e5e7eb; padding: 12px 16px; background: #fafafa; }
.input-wrapper { display: flex; align-items: flex-end; background: #fff; border: 1px solid #e5e7eb; border-radius: 24px; padding: 6px 10px; gap: 10px; }
.message-input { flex: 1; min-height: 24px; max-height: 140px; overflow-y: auto; outline: none; white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 20px; }
.message-input:empty:before { content: attr(placeholder); color: #9ca3af; }
.send-button { width: 36px; height: 36px; border: none; background: #10b981; color: #fff; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: .15s ease; flex-shrink: 0; }
.send-button:disabled { background: #d1d5db; cursor: not-allowed; }
.send-button:not(:disabled):hover { background: #059669; transform: scale(1.05); }

/* Mention menu */
.mention-menu { position: fixed; max-height: 220px; overflow-y: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,.08); z-index: 2000; }
.mention-item { padding: 8px 12px; font-size: 14px; cursor: pointer; }
.mention-item:hover { background: #f3f4f6; }
.trigger { color: #10b981; margin-right: 2px; font-weight: 600; }

/* Scrollbar */
.messages-container::-webkit-scrollbar { width: 6px; }
.messages-container::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.messages-container::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

/* Responsive */
@media (max-width: 600px) { .message-bubble-wrapper { max-width: 82%; } }
</style>
