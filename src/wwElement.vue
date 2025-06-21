<template>
  <div class="chat-wrapper" :style="{ height: content.height || '550px' }">
    <!-- Header -->
    <div v-if="showHeader" class="chat-header">
      <button class="back-btn" @click="$emit('back')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="header-info"><h3>{{ headerTitle }}</h3><span v-if="memberCount" class="member-count">{{ memberCount }} members</span></div>
      <button class="invite-btn" @click="$emit('invite')">+ invite</button>
    </div>

    <!-- Messages list -->
    <div class="messages-container" ref="messagesContainer">
      <div v-for="m in messages" :key="m.id" :class="['msg-row', { own:isOwn(m)}]">
        <img v-if="!isOwn(m)" class="avatar" :src="m.avatar_url||defaultAvatar"/>
        <div class="bubble-wrapper"><div class="meta"><span class="username">{{ m.username }}</span><span class="timestamp">{{ relTime(m.created_at) }}</span></div><div class="bubble" :class="{ ownBubble:isOwn(m) }" v-html="parseMessage(m.content)"></div></div>
        <img v-if="isOwn(m)" class="avatar own-avatar" :src="m.avatar_url||defaultAvatar"/>
      </div>
    </div>

    <!-- Input -->
    <div class="input-bar">
      <div v-if="showMentionMenu" class="mention-menu" :style="mentionMenuStyle"><div v-for="it in filteredMentionItems" :key="it.id" class="mention-item" @click="selectMention(it)"><span class="trigger">{{ currentTrigger }}</span>{{ it.label }}</div></div>
      <div class="input-wrapper"><div ref="messageInput" class="msg-input" contenteditable="true" placeholder="Type a message…" @input="handleInput" @keydown="handleKeydown" @paste="handlePaste"></div><button class="send-btn" :disabled="!canSend" @click="sendMessage"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 21L23 12L2 3V10L17 12L2 14V21Z" fill="currentColor"/></svg></button></div>
    </div>
  </div>
</template>

<script>
import { createClient } from '@supabase/supabase-js'
export default {name:'RealtimeChat',props:{content:{type:Object,default:()=>({})}},data(){return{messages:[],supabase:null,channel:null,isConnected:false,showMentionMenu:false,currentTrigger:null,mentionSearch:'',mentionStartIndex:-1,filteredMentionItems:[],mentionMenuStyle:{},defaultAvatar:'https://placehold.co/40x40/png'}},computed:{supabaseUrl(){return this.content.supabaseUrl},supabaseKey(){return this.content.supabaseKey},tableName(){return this.content.tableName||'messages'},channelId(){return this.content.channelId},currentUserId(){return this.content.currentUserId},currentUsername(){return this.content.currentUsername},mentionTriggers(){return this.content.mentionTriggers||{'@':{items:[],className:'m-user'},'#':{items:[],className:'m-tag'}}},showHeader(){return this.content.showHeader!==false},headerTitle(){return this.content.headerTitle||'Direct Chat'},memberCount(){return this.content.memberCount||null},canSend(){return this.isConnected&&(this.$refs.messageInput?.innerText.trim().length>0)}},watch:{supabaseUrl(){this.reconnect()},supabaseKey(){this.reconnect()},channelId(){this.reconnect()}},mounted(){this.init()},beforeUnmount(){this.disconnect()},methods:{async init(){if(!this.supabaseUrl||!this.supabaseKey)return;this.supabase=createClient(this.supabaseUrl,this.supabaseKey);await this.fetchMessages();this.subscribe();this.isConnected=true},async fetchMessages(){const{data,error}=await this.supabase.from(this.tableName).select('*').eq('channel_id',this.channelId).order('created_at',{ascending:true});if(error)console.error(error);this.messages=data||[];this.$nextTick(this.scrollBottom)},subscribe(){if(this.channel)this.supabase.removeChannel(this.channel);this.channel=this.supabase.channel(`messages:${this.channelId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:this.tableName,filter:`channel_id=eq.${this.channelId}`},({new:m})=>{if(!this.messages.find(x=>x.id===m.id)){this.messages.push(m);this.$nextTick(this.scrollBottom)}}).subscribe()},async sendMessage(){const raw=this.$refs.messageInput.innerText.trim();if(!raw)return;const payload={content:raw,user_id:this.currentUserId,username:this.currentUsername,avatar_url:this.content.currentAvatarUrl||'',channel_id:this.channelId,created_at:new Date().toISOString()};const{error}=await this.supabase.from(this.tableName).insert([payload]);if(error)console.error(error);this.$refs.messageInput.innerText='';this.closeMentionMenu()},disconnect(){if(this.channel)this.supabase.removeChannel(this.channel);this.isConnected=false},reconnect(){this.disconnect();this.init()},isOwn(m){return m.user_id===this.currentUserId},scrollBottom(){const c=this.$refs.messagesContainer;if(c)c.scrollTop=c.scrollHeight},relTime(ts){const diff=Math.floor((Date.now()-new Date(ts))/60000);if(diff<1)return'now';if(diff<60)return diff+'m';const h=Math.floor(diff/60);if(h<24)return h+'h';return Math.floor(h/24)+'d'},parseMessage(t=''){let html=this.escape(t);Object.keys(this.mentionTriggers).forEach(tr=>{const cls=this.mentionTriggers[tr].className;html=html.replace(new RegExp(`\\${tr}(\\w+)`,'g'),`<span class="${cls}">${tr}$1</span>`)});return html.replace(/\n/g,'<br>')},escape(s){return s.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;' }[c]))},caretPos(el){const sel=window.getSelection();if(!sel.rangeCount)return 0;const r=sel.getRangeAt(0),pre=r.cloneRange();pre.selectNodeContents(el);pre.setEnd(r.endContainer,r.endOffset);return pre.toString().length},setCaret(el,pos){const r=document.createRange(),sel=window.getSelection();if(!el.childNodes.length)el.appendChild(document.createTextNode(''));r.setStart(el.firstChild,Math.min(pos,el.firstChild.length));r.collapse(true);sel.removeAllRanges();sel.addRange(r);el.focus()},handleInput(e){const txt=e.target.innerText;this.detectMention(txt,this.caretPos(e.target))},handleKeydown(e){if(this.showMentionMenu){if(['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key))e.preventDefault();if(e.key==='Enter'&&this.filteredMentionItems.length)this.selectMention(this.filteredMentionItems[0]);if(e.key==='Escape')this.closeMentionMenu()}else if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.sendMessage()}},handlePaste(e){e.preventDefault();const t=e.clipboardData.getData('text/plain');document.execCommand('insertText',false,t)},detectMention(text,caret){let found=false;for(const tr of Object.keys(this.mentionTriggers)){const idx=text.lastIndexOf(tr,caret-1);if(idx!==-1){const after=text.substring(idx+1,caret);if(!after.includes(' ')&&!after.includes('\n')){found=true;this.currentTrigger=tr;this.mentionSearch=after;this.mentionStartIndex=idx;this.filterMentionItems();break}}}if(!found)this.closeMentionMenu()},filterMentionItems(){const list=this.mentionTriggers[this.currentTrigger]?.items||[];this.filteredMentionItems=list.filter(i=>i.label.toLowerCase().includes(this.mentionSearch.toLowerCase()));if(this.filteredMentionItems.length){this.showMentionMenu=true;this.$nextTick(this.setMentionMenuPos)}else this.closeMentionMenu()},setMentionMenuPos(){const el=this.$refs.messageInput;if(!el)return;const r=el.getBoundingClientRect();this.mentionMenuStyle={top:r.bottom+6+'px',left:r.left+'px'}},selectMention(it){const el=this.$refs.messageInput,txt=el.innerText,before=txt.substring(0,this.mentionStartIndex),after=txt.substring(this.mentionStartIndex+this.mentionSearch.length+1),mention=`${this.currentTrigger}${it.value} `;el.innerText=before+mention+after;this.setCaret(el,before.length+mention.length);this.closeMentionMenu()},closeMentionMenu(){this.showMentionMenu=false;this.currentTrigger=null;this.filteredMentionItems=[];this.mentionSearch='' }}}
</script>

<style scoped>
.chat-wrapper{display:flex;flex-direction:column;width:100%;height:100%;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.chat-header{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fafafa;border-bottom:1px solid #e5e7eb}
.back-btn,.invite-btn{background:transparent;border:none;color:#6b7280;cursor:pointer;font-size:14px}
.header-info h3{margin:0;font-size:14px;font-weight:600}
.member-count{font-size:12px;color:#9ca3af}
.messages-container{flex:1;overflow-y:auto;padding:18px 16px;background:#f9f9f9}
.msg-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:16px}
.msg-row.own{flex-direction:row-reverse}
.avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0}
.bubble-wrapper{max-width:74%;display:flex;flex-direction:column}
.meta{display:flex;gap:6px;font-size:12px;color:#6b7280;margin-bottom:2px}
.username{font-weight:600;color:#111827}
.bubble{background:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05);word-wrap:break-word;line-height:1.4}
.ownBubble{background:#dcfce7}
.input-bar{border-top:1px solid #e5e7eb;padding:12px 16px;background:#fafafa}
.input-wrapper{display:flex;align-items:flex-end;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px}
.msg-input{flex:1;min-height:20px;max-height:120px;padding:8px 12px;border:none;outline:none;resize:none;font-size:14px;line-height:1.4;overflow-y:auto}
.msg-input:empty:before{content:attr(placeholder);color:#9ca3af}
.send-btn{background:#3b82f6;color:white;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:center;margin-left:8px}
.send-btn:disabled{background:#d1d5db;cursor:not-allowed}
.mention-menu{position:fixed;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);max-height:200px;overflow-y:auto;z-index:1000;min-width:200px}
.mention-item{padding:8px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6}
.mention-item:hover{background:#f3f4f6}
.mention-item:last-child{border-bottom:none}
.mention-item .trigger{font-weight:600;color:#3b82f6}
.m-user,.mention-user{background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-weight:500}
.m-tag,.mention-tag{background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:4px;font-weight:500}
</style>
