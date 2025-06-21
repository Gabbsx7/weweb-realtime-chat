<template>
  <div class="chat-wrapper" :style="{ height: content.height || '500px' }">
    <div class="chat-container">
      <!-- Lista de mensagens -->
      <div class="messages-container" ref="messagesContainer">
        <div 
          v-for="message in messages" 
          :key="message.id"
          :class="['message', { 'own-message': message.user_id === content.currentUserId }]"
        >
          <div class="message-header">
            <span class="username">{{ message.username }}</span>
            <span class="timestamp">{{ formatTime(message.created_at) }}</span>
          </div>
          <div class="message-content" v-html="parseMessage(message.content)"></div>
        </div>
      </div>

      <!-- Input de mensagem -->
      <div class="input-container">
        <!-- Menu de menções -->
        <div v-if="showMentionMenu" class="mention-menu" :style="mentionMenuStyle">
          <div 
            v-for="item in filteredMentionItems" 
            :key="item.id"
            @click="selectMention(item)"
            class="mention-item"
          >
            <span class="mention-trigger">{{ currentTrigger }}</span>
            {{ item.label }}
          </div>
        </div>

        <!-- Campo de input -->
        <div class="input-wrapper">
          <div 
            ref="messageInput"
            class="message-input"
            contenteditable="true"
            @input="handleInput"
            @keydown="handleKeydown"
            @paste="handlePaste"
            placeholder="Digite uma mensagem..."
          ></div>
          <button @click="sendMessage" class="send-button" :disabled="!isConnected">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// Importar Supabase
import { createClient } from '@supabase/supabase-js'

export default {
  name: 'RealtimeChat',
  
  // WeWeb passa as props através de 'content'
  props: {
    content: {
      type: Object,
      default: () => ({})
    }
  },
  
  data() {
    return {
      messages: [],
      messageText: '',
      showMentionMenu: false,
      currentTrigger: null,
      mentionSearch: '',
      mentionStartIndex: -1,
      filteredMentionItems: [],
      mentionMenuStyle: {},
      supabase: null,
      channel: null,
      isConnected: false
    }
  },
  
  computed: {
    // Acessar props através de content
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
        '@': { items: [], className: 'mention-user' },
        '#': { items: [], className: 'mention-tag' }
      }
    }
  },
  
  watch: {
    // Reconectar se as credenciais mudarem
    supabaseUrl() {
      this.reconnect()
    },
    supabaseKey() {
      this.reconnect()
    },
    channelId() {
      this.reconnect()
    }
  },
  
  mounted() {
    this.initializeSupabase()
  },
  
  beforeUnmount() {
    this.disconnect()
  },
  
  methods: {
    async initializeSupabase() {
      try {
        if (!this.supabaseUrl || !this.supabaseKey) {
          console.warn('Supabase credentials not provided')
          return
        }
        
        // Criar cliente Supabase
        this.supabase = createClient(this.supabaseUrl, this.supabaseKey)
        
        // Carregar mensagens e inscrever no canal
        await this.loadMessages()
        this.subscribeToMessages()
        
        this.isConnected = true
      } catch (error) {
        console.error('Error initializing Supabase:', error)
        this.isConnected = false
      }
    },
    
    async loadMessages() {
      if (!this.supabase || !this.channelId) return
      
      try {
        const { data, error } = await this.supabase
          .from(this.tableName)
          .select('*')
          .eq('channel_id', this.channelId)
          .order('created_at', { ascending: true })
          
        if (error) throw error
        
        this.messages = data || []
        this.$nextTick(() => this.scrollToBottom())
      } catch (error) {
        console.error('Error loading messages:', error)
      }
    },
    
    subscribeToMessages() {
      if (!this.supabase || !this.channelId) return
      
      // Desinscrever do canal anterior se existir
      if (this.channel) {
        this.supabase.removeChannel(this.channel)
      }
      
      // Inscrever no novo canal
      this.channel = this.supabase
        .channel(`messages:${this.channelId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: this.tableName,
            filter: `channel_id=eq.${this.channelId}`
          },
          (payload) => {
            // Adicionar nova mensagem apenas se não for duplicada
            if (!this.messages.find(m => m.id === payload.new.id)) {
              this.messages.push(payload.new)
              this.$nextTick(() => this.scrollToBottom())
            }
          }
        )
        .subscribe()
    },
    
    async sendMessage() {
      const content = this.$refs.messageInput.innerText.trim()
      if (!content || !this.supabase || !this.isConnected) return
      
      const message = {
        content,
        user_id: this.currentUserId,
        username: this.currentUsername,
        channel_id: this.channelId,
        created_at: new Date().toISOString()
      }
      
      try {
        const { error } = await this.supabase
          .from(this.tableName)
          .insert([message])
          
        if (error) throw error
        
        // Limpar input
        this.$refs.messageInput.innerText = ''
        this.messageText = ''
      } catch (error) {
        console.error('Error sending message:', error)
        // Você pode adicionar uma notificação de erro aqui
      }
    },
    
    handleInput(event) {
      const text = event.target.innerText
      this.messageText = text
      
      // Detecta menções
      const caretPos = this.getCaretPosition(event.target)
      this.checkForMentions(text, caretPos)
    },
    
    handleKeydown(event) {
      if (this.showMentionMenu) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          // TODO: Implementar navegação no menu
        } else if (event.key === 'Enter') {
          event.preventDefault()
          if (this.filteredMentionItems.length > 0) {
            this.selectMention(this.filteredMentionItems[0])
          }
        } else if (event.key === 'Escape') {
          this.closeMentionMenu()
        }
      } else if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.sendMessage()
      }
    },
    
    handlePaste(event) {
      event.preventDefault()
      const text = event.clipboardData.getData('text/plain')
      document.execCommand('insertText', false, text)
    },
    
    checkForMentions(text, caretPos) {
      const triggers = Object.keys(this.mentionTriggers)
      let foundTrigger = false
      
      for (const trigger of triggers) {
        const lastTriggerIndex = text.lastIndexOf(trigger, caretPos - 1)
        
        if (lastTriggerIndex !== -1) {
          const afterTrigger = text.substring(lastTriggerIndex + 1, caretPos)
          
          // Verifica se não há espaço entre o trigger e o texto
          if (!afterTrigger.includes(' ') && !afterTrigger.includes('\n')) {
            foundTrigger = true
            this.currentTrigger = trigger
            this.mentionSearch = afterTrigger
            this.mentionStartIndex = lastTriggerIndex
            this.updateMentionMenu()
            break
          }
        }
      }
      
      if (!foundTrigger) {
        this.closeMentionMenu()
      }
    },
    
    updateMentionMenu() {
      const items = this.mentionTriggers[this.currentTrigger]?.items || []
      
      this.filteredMentionItems = items.filter(item => 
        item.label.toLowerCase().includes(this.mentionSearch.toLowerCase())
      )
      
      if (this.filteredMentionItems.length > 0) {
        this.showMentionMenu = true
        this.updateMentionMenuPosition()
      } else {
        this.closeMentionMenu()
      }
    },
    
    updateMentionMenuPosition() {
      // Posiciona o menu de menções próximo ao cursor
      const input = this.$refs.messageInput
      if (!input) return
      
      const rect = input.getBoundingClientRect()
      
      this.mentionMenuStyle = {
        bottom: `${window.innerHeight - rect.top + 5}px`,
        left: `${rect.left}px`
      }
    },
    
    selectMention(item) {
      const input = this.$refs.messageInput
      const text = input.innerText
      const beforeMention = text.substring(0, this.mentionStartIndex)
      const afterMention = text.substring(this.mentionStartIndex + this.mentionSearch.length + 1)
      
      const mentionText = `${this.currentTrigger}${item.value} `
      const newText = beforeMention + mentionText + afterMention
      
      input.innerText = newText
      this.messageText = newText
      
      // Posiciona o cursor após a menção
      const newCaretPos = beforeMention.length + mentionText.length
      this.setCaretPosition(input, newCaretPos)
      
      this.closeMentionMenu()
    },
    
    closeMentionMenu() {
      this.showMentionMenu = false
      this.currentTrigger = null
      this.mentionSearch = ''
      this.mentionStartIndex = -1
    },
    
    parseMessage(content) {
      let parsed = this.escapeHtml(content)
      
      // Substitui menções por spans estilizados
      Object.keys(this.mentionTriggers).forEach(trigger => {
        const regex = new RegExp(`\\${trigger}(\\w+)`, 'g')
        const className = this.mentionTriggers[trigger].className
        parsed = parsed.replace(regex, `<span class="${className}">${trigger}$1</span>`)
      })
      
      // Substitui quebras de linha
      parsed = parsed.replace(/\n/g, '<br>')
      
      return parsed
    },
    
    formatTime(timestamp) {
      const date = new Date(timestamp)
      return date.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    },
    
    scrollToBottom() {
      const container = this.$refs.messagesContainer
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    },
    
    getCaretPosition(element) {
      const selection = window.getSelection()
      if (selection.rangeCount === 0) return 0
      
      const range = selection.getRangeAt(0)
      const preCaretRange = range.cloneRange()
      preCaretRange.selectNodeContents(element)
      preCaretRange.setEnd(range.endContainer, range.endOffset)
      
      return preCaretRange.toString().length
    },
    
    setCaretPosition(element, position) {
      const range = document.createRange()
      const selection = window.getSelection()
      
      // Verificar se o elemento tem conteúdo
      if (element.childNodes.length === 0) {
        element.appendChild(document.createTextNode(''))
      }
      
      range.setStart(element.firstChild, Math.min(position, element.textContent.length))
      range.collapse(true)
      
      selection.removeAllRanges()
      selection.addRange(range)
      element.focus()
    },
    
    escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }
      return text.replace(/[&<>"']/g, m => map[m])
    },
    
    reconnect() {
      this.disconnect()
      this.initializeSupabase()
    },
    
    disconnect() {
      if (this.channel) {
        this.supabase.removeChannel(this.channel)
        this.channel = null
      }
      this.isConnected = false
    }
  }
}
</script>

<style scoped>
.chat-wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: #e5ddd5;
  background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4d4d4' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}

.message {
  max-width: 65%;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  animation: messageIn 0.3s ease-out;
}

@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.own-message {
  align-self: flex-end;
  margin-left: auto;
}

.message-header {
  font-size: 12px;
  color: #667781;
  margin-bottom: 2px;
  display: flex;
  gap: 8px;
}

.message.own-message .message-header {
  justify-content: flex-end;
}

.username {
  font-weight: 600;
}

.timestamp {
  opacity: 0.7;
}

.message-content {
  background-color: white;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.13);
  word-wrap: break-word;
  position: relative;
}

.message-content::before {
  content: '';
  position: absolute;
  top: 0;
  width: 0;
  height: 0;
  border-style: solid;
}

.message:not(.own-message) .message-content::before {
  left: -8px;
  border-width: 0 8px 8px 0;
  border-color: transparent white transparent transparent;
}

.message.own-message .message-content {
  background-color: #d9fdd3;
}

.message.own-message .message-content::before {
  right: -8px;
  border-width: 0 0 8px 8px;
  border-color: transparent transparent transparent #d9fdd3;
}

.input-container {
  position: relative;
  background-color: #f0f2f5;
  padding: 10px 20px;
  border-top: 1px solid #e1e4e8;
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  background-color: white;
  border-radius: 24px;
  padding: 5px 5px 5px 15px;
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.13);
}

.message-input {
  flex: 1;
  min-height: 20px;
  max-height: 120px;
  overflow-y: auto;
  outline: none;
  padding: 8px 0;
  line-height: 20px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.message-input:empty:before {
  content: attr(placeholder);
  color: #999;
  pointer-events: none;
}

.send-button {
  width: 40px;
  height: 40px;
  border: none;
  background-color: #00a884;
  color: white;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-button:hover:not(:disabled) {
  background-color: #008f6f;
  transform: scale(1.05);
}

.send-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.mention-menu {
  position: fixed;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
  min-width: 200px;
}

.mention-item {
  padding: 8px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;
}

.mention-item:hover {
  background-color: #f5f5f5;
}

.mention-trigger {
  color: #00a884;
  font-weight: bold;
  margin-right: 4px;
}

/* Estilos para menções no texto */
.mention-user {
  color: #06cf9c;
  font-weight: 500;
  cursor: pointer;
  background-color: rgba(6, 207, 156, 0.1);
  padding: 0 4px;
  border-radius: 3px;
}

.mention-tag {
  color: #1976d2;
  font-weight: 500;
  cursor: pointer;
  background-color: rgba(25, 118, 210, 0.1);
  padding: 0 4px;
  border-radius: 3px;
}

.mention-command {
  color: #f50057;
  font-weight: 500;
  cursor: pointer;
  background-color: rgba(245, 0, 87, 0.1);
  padding: 0 4px;
  border-radius: 3px;
}

/* Scrollbar customizada */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
  background: #999;
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: #666;
}

/* Responsividade */
@media (max-width: 768px) {
  .message {
    max-width: 85%;
  }
  
  .messages-container {
    padding: 10px;
  }
  
  .input-container {
    padding: 10px;
  }
}

/* Estados de carregamento */
.chat-container.loading {
  opacity: 0.6;
  pointer-events: none;
}

.chat-container.loading::after {
  content: 'Conectando...';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  color: #666;
}
</style>