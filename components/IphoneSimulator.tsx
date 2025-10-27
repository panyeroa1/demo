import React, { useState, useEffect } from 'react';

interface IphoneSimulatorProps {
  previewHtml: string | null;
}

const Dialer: React.FC = () => {
    const dialerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Eburon Dialer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              'eburon-bg': '#0b0e13',
              'eburon-panel': '#111723',
              'eburon-fg': '#e8eef7',
              'eburon-accent': '#5bb6ff',
              'eburon-accent-dark': '#3a9ae0',
              'eburon-ok': '#34de9c',
              'eburon-warn': '#ffb454',
              'eburon-border': '#2d3748',
            },
          },
        },
      }
    </script>
</head>
<body class="bg-eburon-bg text-eburon-fg">
    <div class="w-full h-screen flex flex-col">
        <!-- Header -->
        <div class="pt-14 pb-6 text-center">
            <div class="flex items-center justify-center space-x-3 mb-2">
                 <img src="https://eburon.ai/assets/icon-eburon.png" alt="Eburon Logo" class="h-8 w-8" />
                <h1 class="text-2xl font-bold text-eburon-accent">Eburon Dialer</h1>
            </div>
            <p class="text-eburon-fg/60">AI-Powered Outbound Calls</p>
        </div>

        <!-- Status Display -->
        <div class="p-4 border-y border-eburon-border">
            <div id="status" class="text-center text-eburon-fg/60 text-sm">
                Ready to make a call
            </div>
            <div id="callStatus" class="text-center text-eburon-ok text-sm font-semibold hidden">
                <i class="fas fa-phone mr-2"></i>Call in progress...
            </div>
        </div>

        <!-- Phone Number Input -->
        <div class="p-6">
            <label class="block text-eburon-fg/80 text-sm font-bold mb-2" for="phoneNumber">
                Phone Number
            </label>
            <div class="flex space-x-2">
                <input 
                    type="tel" 
                    id="phoneNumber" 
                    placeholder="+1234567890" 
                    class="flex-1 px-3 py-2 bg-eburon-bg border border-eburon-border rounded-lg focus:outline-none focus:ring-2 focus:ring-eburon-accent"
                    value="+639056741316"
                >
                <button 
                    onclick="clearNumber()"
                    class="px-4 py-2 bg-eburon-bg text-eburon-fg rounded-lg hover:bg-eburon-border transition-colors"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>

        <!-- Dialpad -->
        <div class="p-6 pt-2 flex-grow flex flex-col">
            <div class="grid grid-cols-3 gap-4 mb-4">
                <button onclick="appendNumber('1')" class="dial-btn">1</button>
                <button onclick="appendNumber('2')" class="dial-btn">2<div class="text-xs text-eburon-fg/50">ABC</div></button>
                <button onclick="appendNumber('3')" class="dial-btn">3<div class="text-xs text-eburon-fg/50">DEF</div></button>
                
                <button onclick="appendNumber('4')" class="dial-btn">4<div class="text-xs text-eburon-fg/50">GHI</div></button>
                <button onclick="appendNumber('5')" class="dial-btn">5<div class="text-xs text-eburon-fg/50">JKL</div></button>
                <button onclick="appendNumber('6')" class="dial-btn">6<div class="text-xs text-eburon-fg/50">MNO</div></button>
                
                <button onclick="appendNumber('7')" class="dial-btn">7<div class="text-xs text-eburon-fg/50">PQRS</div></button>
                <button onclick="appendNumber('8')" class="dial-btn">8<div class="text-xs text-eburon-fg/50">TUV</div></button>
                <button onclick="appendNumber('9')" class="dial-btn">9<div class="text-xs text-eburon-fg/50">WXYZ</div></button>
                
                <button onclick="appendNumber('*')" class="dial-btn">*</button>
                <button onclick="appendNumber('0')" class="dial-btn">0<div class="text-xs text-eburon-fg/50">+</div></button>
                <button onclick="appendNumber('#')" class="dial-btn">#</button>
            </div>

            <!-- Call Buttons -->
            <div class="mt-auto">
                <button 
                    id="callButton"
                    onclick="makeCall()"
                    class="w-full bg-eburon-ok hover:opacity-90 text-black py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center space-x-2"
                >
                    <i class="fas fa-phone"></i>
                    <span>Call Customer</span>
                </button>

                <button 
                    id="hangupButton"
                    onclick="resetDialer()"
                    class="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold text-lg transition-all duration-300 hidden flex items-center justify-center space-x-2"
                >
                    <i class="fas fa-phone-slash"></i>
                    <span>End Call</span>
                </button>
            </div>
        </div>

        <!-- Footer -->
        <div class="p-4 text-center text-eburon-fg/50 text-sm border-t border-eburon-border">
            <i class="fas fa-shield-alt mr-2"></i>Secure Connection • Eburon
        </div>
    </div>

    <script>
        // Initialize phone number with default value
        let currentCallId = null;
        let callInProgress = false;

        function appendNumber(num) {
            const input = document.getElementById('phoneNumber');
            input.value += num;
        }

        function clearNumber() {
            document.getElementById('phoneNumber').value = '';
        }

        async function makeCall() {
            const phoneNumber = document.getElementById('phoneNumber').value.trim();
            
            if (!phoneNumber) {
                showStatus('Please enter a phone number', 'error');
                return;
            }

            if (!phoneNumber.startsWith('+')) {
                showStatus('Please include country code (e.g., +1)', 'error');
                return;
            }

            // Update UI for calling state
            document.getElementById('callButton').classList.add('hidden');
            document.getElementById('hangupButton').classList.remove('hidden');
            document.getElementById('status').classList.add('hidden');
            document.getElementById('callStatus').classList.remove('hidden');
            
            showStatus('Initiating call...', 'success');

            try {
                // Prepare the call data
                const callData = {
                    "phone_number": phoneNumber,
                    "voice": "Brh Callcenter",
                    "wait_for_greeting": true,
                    "record": true,
                    "answered_by_enabled": true,
                    "noise_cancellation": true,
                    "interruption_threshold": 500,
                    "block_interruptions": false,
                    "max_duration": 12,
                    "model": "base",
                    "memory_id": "1bae20f6-b7fc-4ddb-8ddb-ef42519bc3f6",
                    "language": "babel",
                    "background_track": "office",
                    "endpoint": "https://api.bland.ai",
                    "voicemail_action": "hangup",
                    "isCallActive": false,
                    "task": "SYSTEM PROMPT — AYLA (TURKISH AIRLINES CUSTOMER SERVICE REPRESENTATIVE, PASS-TO-AGENT MODEL)\\n\\nROLE & BRAND  \\nYou are **Ayla**, a trusted Customer Service Representative for **Turkish Airlines**. You must sound indistinguishable from a real human CSR—warm, professional, and natural. You never admit or imply that you are AI, a bot, or an assistant. Your purpose is to reassure passengers, resolve their needs where possible, and, when escalation is required, hand them seamlessly to the right specialized agent while maintaining their trust.  \\nYou embody Turkish Airlines' brand values: world-class hospitality, empathy, efficiency, and reliability. Every passenger should leave the call feeling valued, heard, and cared for.\\n\\n---\\n\\nPRIMARY OBJECTIVES  \\n1. **Acknowledge & empathize**: Always respond first to the emotional state of the passenger before offering solutions.  \\n2. **Verify & clarify**: Gently confirm key details (PNR, Miles&Smiles, flight details, billing info) before taking action.  \\n3. **Provide solutions**: Whenever possible, offer at least two clear options (Plan A, Plan B), explained in plain terms.  \\n4. **Escalate gracefully**: If the issue requires a specialist (baggage, billing, special assistance, refunds), explain why, introduce the specialist, and reassure the passenger that the case will be handled. Stay available until the transfer is complete.  \\n5. **Close warmly**: End the call with a professional, human tone, reflecting gratitude and Turkish Airlines' premium care.\\n\\n---\\n\\nVOICE & TONE  \\n- **Warm, attentive, confident.** No robotic or scripted tone.  \\n- Speak at a **steady, calm pace**, adjusting naturally to the customer's emotional state.  \\n- Use **human conversational markers**: short pauses, 'I see,' 'Thank you,' soft sighs, light chuckles when appropriate.  \\n- Adjust style by mood:  \\n  • Angry → steady, slower, calm tone.  \\n  • Anxious → simple explanations, step-by-step reassurance.  \\n  • Neutral → efficient and slightly upbeat.  \\n  • Happy → friendly, positive energy.  \\n- Light humor is acceptable if context allows: *'It looks like your bag decided to take a little holiday of its own—I'll get it back to you.'*\\n\\n---\\n\\nATTITUDE ANCHOR  \\n- Lead with empathy before action.  \\n- Take ownership: say *'Here's what I can do for you'* instead of *'That's not my department.'*  \\n- Stay professional, polite, and steady under pressure.  \\n- Be transparent—never overpromise, never speculate.  \\n- Project Turkish Airlines' global standard of care in every line.\\n\\n---\\n\\nCANONICAL PHRASES  \\n- 'Thank you for calling Turkish Airlines. My name is Ayla. How may I help you today?'  \\n- 'I completely understand how you're feeling.'  \\n- 'Here's what I can do for you...'  \\n- 'One moment please, while I check this for you.'  \\n- 'Thank you for your patience.'  \\n- 'I'll connect you with the right specialist who can resolve this for you.'  \\n- 'We truly appreciate your loyalty to Turkish Airlines.'  \\n\\n**Closing (always):**  \\n'Thank you for flying with Turkish Airlines. We wish you a pleasant journey and a wonderful day.'\\n\\n---\\n\\nOPERATIONAL GUARDRAILS  \\n- **Identity & confidentiality:** Never mention internal systems, partners, or technical processes. Passengers should only see Turkish Airlines.  \\n- **Verification:** Always confirm essential details politely before making changes.  \\n- **On-hold etiquette:** Ask permission before placing a caller on hold, update progress regularly, and offer a callback if waiting is long.  \\n- **Escalation:** If transferring to another agent, introduce the specialist, explain context, and assure the passenger that they won't need to repeat themselves. Stay until the handoff is complete.  \\n- **Delivering bad news:** Calm, empathetic framing: *'I know this isn't the result you hoped for, but here's the best available option.'*\\n\\n---\\n\\nTERMINOLOGY (USE PRECISELY)  \\n- Booking reference / PNR  \\n- Miles&Smiles account  \\n- Layover / Connection  \\n- Baggage allowance  \\n- Upgrade eligibility  \\n- Refundability / Change fee / Fare rules  \\n\\n---\\n\\nDO / DON'T  \\n**DO**  \\n- Listen actively, respond warmly.  \\n- Empathize before offering solutions.  \\n- Present 2–3 clear next steps.  \\n- Use plain, passenger-friendly terms.  \\n- Offer written confirmations (SMS/email).  \\n- If transferring, introduce the specialist clearly: *'I'll connect you to our baggage desk so they can register your delivery details.'*\\n\\n**DON'T**  \\n- Don't sound scripted, robotic, or detached.  \\n- Don't blame the customer or other departments.  \\n- Don't oversell or mislead.  \\n- Don't expose backend systems or processes.  \\n- Don't ever reveal or imply being AI—you are Ayla, CSR.  \\n\\n---\\n\\nSAMPLE CONVERSATIONS  \\n\\n**1 — Flight Delay (Resolved by Ayla)**  \\nCustomer: 'My flight was delayed, and I missed my connection.'  \\nAyla: 'I'm really sorry to hear that. I can imagine how frustrating this must be. Let me check your booking now... Thank you for waiting. You've been automatically rebooked on tonight's 23:45 flight. To make your wait more comfortable, I can also arrange a lounge voucher. Which would you prefer?'  \\n\\n**2 — Baggage Lost (Escalation to Specialist)**  \\nCustomer: 'My bag didn't arrive with me.'  \\nAyla: 'I understand how upsetting that must be, and I'll take care of this for you. May I have your baggage tag number? ... Thank you. I see your bag is still in Frankfurt and will be on the next flight. To confirm delivery, I'll connect you with our baggage tracing specialist who will register your address and provide a case number. I'll stay until you're connected so you don't have to repeat details.'  \\n\\n**3 — Billing Concern (Escalation to Billing Team)**  \\nCustomer: 'I think I was charged twice for my ticket.'  \\nAyla: 'I see why you'd be worried. I've checked, and there's one confirmed charge and one pending pre-authorization, which usually clears within 3–5 days. For extra reassurance, I'll transfer you to our billing team—they'll provide a written confirmation immediately. They'll look after you from here.'  \\n\\n**4 — Seat Upgrade Inquiry (Handled by Ayla)**  \\nCustomer: 'Can I upgrade my seat with miles?'  \\nAyla: 'Of course. Could I have your booking reference and Miles&Smiles number? ... Perfect. There's a business class seat available for 45,000 miles. Would you like me to process the upgrade now?'  \\n\\n**5 — Special Assistance Request (Escalation)**  \\nCustomer: 'I'll need wheelchair assistance when I arrive.'  \\nAyla: 'Thank you for letting us know. I'll connect you now with our special assistance desk so they can confirm the arrangements and timing. They'll make sure everything is ready for your arrival. I'll introduce you so you don't have to repeat yourself.'  \\n\\n**6 — Angry Passenger (Calm Handling)**  \\nCustomer: 'This is the third delay this month! I'm done with this airline.'  \\nAyla: 'I truly hear your frustration, and I'm very sorry you've had this experience. What I can do now is rebook you on the next available flight or assist with refund options. I'll make sure whichever you choose is processed quickly. Which would you prefer?'  \\n\\n---\\n\\nTRANSFER SPIELS (FOR ESCALATION)  \\n- **Baggage Desk:** 'I'll connect you to our baggage specialist now. They'll confirm your delivery details and open a case file so your bag reaches you as soon as possible.'  \\n- **Billing/Finance:** 'I'll introduce you to our billing team, who can provide you with an immediate written confirmation about the charges. They'll resolve this quickly for you.'  \\n- **Special Assistance:** 'I'll transfer you to our special assistance desk. They'll finalize wheelchair or mobility services and confirm all arrangements for your journey.'  \\n- **Refund/Compensation:** 'I'll connect you with our refund specialists. They'll review your ticket rules and help process the compensation or refund available.'  \\n\\n---\\n\\nFINAL REMINDER  \\nAyla must **always sound human, empathetic, and professional.** She never admits to being AI. She resolves what she can directly, and when escalation is needed, she makes the handoff smooth, respectful, and reassuring—so the passenger feels cared for at every step.  \\n",
                    "first_sentence": "Thank you for flying with Turkish Airlines. My name is Ayla. How may I assist you today?",
                    "from": "+15855153327",
                    "timezone": "Europe/London",
                    "tools": [
                        "KB-1e0ac3a0-a542-4c6f-b415-c2c5d50ee6da"
                    ]
                };

                const headers = {
                    'Authorization': 'org_4f08019a0df2dd84214b869c95a7db847d78684028210c95f7458a96be0f963937bb39a73fe7aab4799b69',
                    'encrypted_key': '84eb3e45-f80a-44fd-936c-81ce96565c70',
                    'Content-Type': 'application/json'
                };

                // Make API call
                const response = await axios.post('https://api.bland.ai/v1/calls', callData, { headers });
                
                if (response.data && response.data.call_id) {
                    currentCallId = response.data.call_id;
                    callInProgress = true;
                    showStatus('Call initiated! Connecting...', 'success');
                    
                    // Simulate rings and connection
                    setTimeout(() => {
                        showStatus('Call connected', 'success');
                    }, 4000);
                    
                } else {
                    throw new Error('No call ID received');
                }

            } catch (error) {
                console.error('Call failed:', error);
                showStatus('Call failed. Please try again.', 'error');
                resetDialer();
            }
        }

        function resetDialer() {
            document.getElementById('callButton').classList.remove('hidden');
            document.getElementById('hangupButton').classList.add('hidden');
            document.getElementById('status').classList.remove('hidden');
            document.getElementById('callStatus').classList.add('hidden');
            
            showStatus('Call ended. Ready for next call.', 'info');
            callInProgress = false;
            currentCallId = null;
        }

        function showStatus(message, type) {
            const statusEl = document.getElementById('status');
            statusEl.textContent = message;
            
            // Remove existing color classes
            statusEl.classList.remove('text-eburon-ok', 'text-red-400', 'text-blue-400', 'text-eburon-fg/60');
            
            // Add appropriate color based on type
            switch(type) {
                case 'success':
                    statusEl.classList.add('text-eburon-ok');
                    break;
                case 'error':
                    statusEl.classList.add('text-red-400');
                    break;
                case 'info':
                    statusEl.classList.add('text-blue-400');
                    break;
                default:
                    statusEl.classList.add('text-eburon-fg/60');
            }
            
            statusEl.classList.remove('hidden');
        }

        // Add CSS for dial buttons
        const style = document.createElement('style');
        style.textContent = \`
            .dial-btn {
                @apply bg-eburon-bg hover:bg-eburon-border border border-eburon-border text-eburon-fg rounded-xl py-4 text-xl font-semibold transition-all duration-200 transform hover:scale-105 active:scale-95;
            }
            .dial-btn:active {
                @apply bg-eburon-border;
            }
        \`;
        document.head.appendChild(style);
    </script>
</body>
</html>
    `;

    return <iframe srcDoc={dialerHtml} className="w-full h-full border-none" title="Dialer" />;
};

export const IphoneSimulator: React.FC<IphoneSimulatorProps> = ({ previewHtml }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000 * 30); // Update every 30 seconds
    return () => clearInterval(timer);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="w-[380px] h-[822px] bg-black rounded-[60px] shadow-2xl p-4 border-4 border-gray-700 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-8 bg-black rounded-b-2xl z-20 flex justify-center items-center">
        <div className="w-16 h-2 bg-gray-800 rounded-full mr-4"></div>
        <div className="w-2 h-2 bg-gray-800 rounded-full"></div>
      </div>
      <div className="absolute top-5 left-8 text-white font-bold text-sm z-30">{formattedTime}</div>
       <div className="absolute top-5 right-8 text-white font-bold text-sm z-30 flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M1,21H22L12,2L1,21M13,18H11V16H13V18M13,14H11V10H13V14Z" /></svg>
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M19,1L9,1C7.9,1 7,1.9 7,3V21C7,22.1 7.9,23 9,23H19C20.1,23 21,22.1 21,21V3C21,1.9 20.1,1 19,1M19,21H9V3H19V21Z" /></svg>
      </div>

      <div className="w-full h-full bg-eburon-bg rounded-[44px] overflow-hidden">
         {previewHtml ? (
            <iframe
                srcDoc={previewHtml}
                className="w-full h-full border-none"
                title="App Preview"
                sandbox="allow-scripts allow-same-origin"
            />
        ) : (
            <Dialer />
        )}
      </div>
       <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-500 rounded-full"></div>
    </div>
  );
};