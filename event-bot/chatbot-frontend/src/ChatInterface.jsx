// src/ChatInterface.jsx
import React, { useState, useRef, useEffect } from 'react';
import './ChatInterface.css'; // We'll create this file next

const BACKEND_URL = "http://localhost:3000"; // Change if your backend PORT is different

function ChatInterface() {
  const [messages, setMessages] = useState([
    { text: "Hello! I'm the Event Chatbot. How can I help you?", sender: 'bot' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Scrolls to the bottom of the chat window
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // Handler for sending a message
  const sendMessage = async (e) => {
    e.preventDefault();
    const userQuery = input.trim();
    if (!userQuery) return;

    // 1. Add user message to history
    const newUserMessage = { text: userQuery, sender: 'user' };
    setMessages(prev => [...prev, newUserMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // 2. Call the backend /chat endpoint
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userQuery, tags: [] }), // You can add tag support later
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // 3. Add bot response to history
      const botResponse = {
        text: data.answer || "I seem to be having trouble connecting. Please try again.",
        sender: 'bot'
      };
      setMessages(prev => [...prev, botResponse]);

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { text: "An error occurred. Please check the backend connection.", sender: 'bot' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <h2>SUIET Event Info Chatbot</h2>
      
      {/* Chat Messages Display */}
      <div className="messages-window">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            <span className="sender-label">{msg.sender === 'user' ? 'You:' : 'Bot:'}</span> {msg.text}
          </div>
        ))}
        {isLoading && <div className="message bot loading">Bot: Typing...</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form className="input-form" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about any events..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatInterface;