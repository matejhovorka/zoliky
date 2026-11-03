import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Smile } from 'lucide-react';

const QUICK_EMOJIS = ['🃏', '🔥', '👏', '😂', '😭', '🎯', '🍀', '🤔'];

export default function Chat({
  messages = [],
  onSendMessage,
  isOpen,
  onToggle
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const handleEmojiClick = (emoji) => {
    onSendMessage(emoji);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={onToggle}
        className="fixed bottom-24 right-4 z-40 p-3 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white rounded-full shadow-lg shadow-amber-900/40 transition flex items-center justify-center"
        title="Otevřít chat"
      >
        <MessageSquare className="w-5 h-5" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {Math.min(9, messages.length)}
          </span>
        )}
      </button>

      {/* Chat Drawer / Overlay */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-80 bg-stone-900/95 backdrop-blur-md border-l border-stone-800 shadow-2xl flex flex-col animate-slide-left text-stone-100">
          {/* Header */}
          <div className="px-4 py-3 border-b border-stone-800 flex items-center justify-between bg-stone-950/70">
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <MessageSquare className="w-5 h-5" />
              <span>Herní chat</span>
            </div>
            <button
              onClick={onToggle}
              className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Reaction Emojis */}
          <div className="px-3 py-2 bg-stone-950/40 border-b border-stone-800/80 flex items-center justify-around">
            {QUICK_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="text-lg hover:scale-125 active:scale-95 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs sm:text-sm">
            {messages.length === 0 ? (
              <div className="text-center text-stone-500 my-auto py-10">
                Zatím žádné zprávy. Pošlete první zprávu nebo smajlík!
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="bg-stone-800/80 p-2.5 rounded-xl border border-stone-700/50">
                  <div className="flex items-center justify-between text-[10px] text-stone-400 font-medium mb-1">
                    <span className="font-bold text-amber-300">{msg.senderName}</span>
                    <span>{msg.time}</span>
                  </div>
                  <div className="text-stone-200 text-sm whitespace-pre-wrap break-words">{msg.text}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input field */}
          <form onSubmit={handleSend} className="p-3 border-t border-stone-800 bg-stone-950/80 flex gap-2">
            <input
              type="text"
              placeholder="Napište zprávu..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              maxLength={200}
              className="flex-1 px-3 py-2 bg-stone-900 border border-stone-700 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 text-xs sm:text-sm"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-3 py-2 bg-amber-600 disabled:opacity-40 hover:bg-amber-500 active:scale-95 text-white font-bold rounded-xl transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

