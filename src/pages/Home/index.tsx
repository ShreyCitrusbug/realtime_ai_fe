// External imports
import React, { useState, useRef } from "react";

import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

interface ICheckBox{
  name:string
}

interface ChatMessage {
  content: string;
}

interface IUserMessage{
  identity : string;
  initialDiagnostics : string;
  emotion: string;
  diagnosesSuggestion : string
}

const RealtimeAiBOTPage : React.FC =()=>{
    const [wenRTCState,setWebRTCState] = useState<boolean>(false)
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const [isLoading,setIsLoading] = useState<boolean>(false)
    const [userMessage,setUserMessage] = useState<IUserMessage>({identity : "",initialDiagnostics : "",emotion : "",diagnosesSuggestion : ""})

    // Playing model's audio 
    const audioDivRef = useRef<HTMLDivElement>(null);

    // Function calling states
    const [checkBoxState, setCheckBoxState] = useState<Record<string,boolean>>({});
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);


    const date = new Date().toLocaleDateString(undefined,{
      dateStyle : "long",
    });
    const BASE_URL = import.meta.env.VITE_API_BASE_URL

    const checkBoxItems = [
      {
        "id" : "identityVerification",
        "name" : "Identity Verification",
      },
      {
        "id" : "patientCheckIn",
        "name" : "Patient Check In",
      },
      {
        "id" : "initialDiagnostics", 
        "name" : "Initial Diagnosis",
      },
      {
        "id":"emotionDetection",
        "name":"Emotion"
      },
      {
        "id" : "diagnosesSuggestion",
        "name" : "Diagnoses Suggestion"
      }
    ]

    // function to handle audio Div Element
    function handleDataChannelTrack(event:RTCTrackEvent){
        const audioElement = document.createElement('audio');
        audioElement.srcObject = event.streams[0];
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioDivRef.current?.appendChild(audioElement);
    }    

    // Real-time AI function calls
    const functions = {
      enableCheckBox :  (parsedArguments:ICheckBox)=>{
        const {name} = parsedArguments
        // call the API to enable the checkbox
        setCheckBoxState((prevState)=>({
          ...prevState,
          [name]:true
        }))
          if (["identityVerification", "initialDiagnostics", "emotionDetection", "diagnosesSuggestion"].includes(name)) {
            const key = 
              name === "identityVerification" ? "identity" :
              name === "initialDiagnostics" ? "initialDiagnostics" :
              name === "emotionDetection" ? "emotion" :
              "diagnosesSuggestion";

            const updatedMessage = {
              identity: "",
              initialDiagnostics: "",
              emotion: "",
              diagnosesSuggestion: "",
              [key]: chatMessages[chatMessages.length - 1]?.content || ""
            };
            setUserMessage(updatedMessage)
            if (name === "diagnosesSuggestion") {
              console.log(userMessage,",,,,")
              saveUserMessages(userMessage);
            }
          }

          setChatMessages([]);
          return {success:true, checkBoxName : name}
      },
    }

    // Function to handle data channel
    function createDataChannel(peerConnection:RTCPeerConnection){
        const dataChannel = peerConnection.createDataChannel("response")
        dataChannelRef.current = dataChannel;
        dataChannel.addEventListener("open",()=>{
            console.log("Data Channel Opened")
            sessionFunctions()
        })

        dataChannel.addEventListener("message" , (event)=>{
            const message = JSON.parse(event.data)
            // Listen Conversion created event and save user message
            if(message.type === "conversation.item.created"){
              const item= message.item
              if(item.type === "message"){
                if(item.role === "user") {
                const transcriptPart = item.content.find(
                  (c: any) => c.type === "input_audio" || c.type === "input_text"
                );
                console.log(transcriptPart,'user transcript')
                if (transcriptPart?.transcript) {
                  addUserMessage(transcriptPart.transcript);
                    }
                  }
            }}
            // Catch the conversion and function call
            if (message.type === "response.done"){
              const outputItems = message?.response?.output || []
              for (const item of outputItems){
                if (item.type === "function_call"){
                  const functionName = item.name;
                  const args = item.arguments || "{}"
                  try{
                    const parsedArgs = JSON.parse(args);  
                    const fun = functions[functionName as keyof typeof functions]
                    if (!fun) {
                      console.warn("Function not found:", functionName)
                      return
                    }
                    const result =  fun(parsedArgs)
                    const functionOutputEvent = {
                      type: "conversation.item.create",
                      item: {
                        type: "function_call_output",
                        call_id: item.call_id,
                        output: JSON.stringify({
                          result
                        }),
                      },
                    };
                    dataChannel.send(JSON.stringify(functionOutputEvent));
                    dataChannel.send(JSON.stringify({ type: "response.create" }));
                  }catch (error) {
                    console.log(error)
                  }
                }
              }
            }
            
        })
    }

    // Configure AI about the function call 
    function sessionFunctions(){
        const dataChannel = dataChannelRef.current
        if (!dataChannel) return;
        const event = {
            type : "session.update",
            session : {
                modalities : ['text','audio'],
                tools:[
                    {
                        type: "function",
                        name: "enableCheckBox",
                        description:
                        "Enable the checkbox when the function is called",
                        parameters: {
                        type: "object",
                        properties: {
                            name: {
                            type: "string",
                            description: "Name of the checkbox",
                            },
                        },
                        required: ["name"],
                        },
                    }
                ],
                tool_choice:"auto"
            }
        }
        dataChannel.send(JSON.stringify(event))
    }

    // Web RTC Start/Stop Functions
    function startWebRTC(){
        if (wenRTCState) return;
        const peerConnection = new RTCPeerConnection()
        peerConnectionRef.current = peerConnection
        peerConnection.ontrack = handleDataChannelTrack
        createDataChannel(peerConnection)

        navigator.mediaDevices.getUserMedia({audio : true}).then((stream)=>{
            stream.getTracks().forEach((track)=>{
                peerConnection.addTransceiver(track,{direction : "sendrecv"})
            });

            peerConnection.createOffer().then((offer)=>{
                peerConnection.setLocalDescription(offer)
                fetch(`${BASE_URL}/rtc/connect`,{
                    method : "POST",
                    headers: {
                        "Content-Type": "application/sdp",
                    },
                    body:offer.sdp
                }).then((response)=>response.text()).then((data)=>{
                    peerConnection.setRemoteDescription({
                        sdp: data,
                        type: "answer"
                    }).catch((error)=>{
                        console.log(error,"Error while calling webRTC")
                      })
                    }).catch((error)=>{ 
                      console.log(error,"Error while calling webRTC.")
                      toast.error("Error while connecting to AI agent.")
                    stopWebRTC()
                    setWebRTCState(false)
                })
            })
        }).catch((error)=>{
            console.log(error,"Error while calling webRTC.")
        }).finally(()=>{
          toast.success("Connection with AI agent is established.")
          setWebRTCState(true)
        })

    }

    function stopWebRTC(){
        if (!wenRTCState) return;
        const peerConnection = peerConnectionRef.current
        const dataChannel = dataChannelRef.current

        peerConnection?.getReceivers().forEach((receiver)=>{
            receiver.track && receiver.track.stop()
        })
        dataChannel?.close()
        peerConnection?.close()

        peerConnectionRef.current = null
        dataChannelRef.current = null
        setWebRTCState(false)
        setCheckBoxState({})
    }

    // function to handle the button click
    const handleClick =()=>{
        if (!wenRTCState && !isLoading){
            setIsLoading(true)
            startWebRTC()
            setTimeout(() => {
                setIsLoading(false);
                setWebRTCState(true);
            }, 2000);
        }else{
            toast.warn("Connection with AI agent is closed.")
            stopWebRTC()
            setWebRTCState(false)
        }
    }

    // Function to manage the user's input messages
    const addUserMessage = (content:string)=>{
      setChatMessages((prevMessage)=>{
        if(prevMessage.length > 0){
          const lastMessage = prevMessage[prevMessage.length - 1]
          if (lastMessage.content === content){
            return prevMessage;
          }
        }
        return [...prevMessage,{content}]
      })
    }

    // API call to save all user's messages
    const saveUserMessages = async (message :IUserMessage)=>{
      try{
        const requestData = {
          "identity" : message.identity,
          "initial_diagnostics" : message.initialDiagnostics,
          "emotion" : message.emotion,
          "diagnoses_suggestion" : message.diagnosesSuggestion
        }
        const response = await fetch(`${BASE_URL}/conversation`,{
          method : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body:JSON.stringify({
            requestData
          })
        })
        return response
      }catch (error){
        
      }
    }

return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <ToastContainer />
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-5xl w-full">
        <header className="mb-8">
          <p className="text-gray-300 text-lg font-bold">{`${date}`}</p>
        </header>
        <div className="grid grid-cols-3 gap-6 items-center w-full max-w-5xl">
          <div className="space-y-4">
            {checkBoxItems.map((item,index) => (
              <div key={index} className="flex items-center space-x-3">
              <input
                type="checkbox"
                id={item.id}
                className="peer hidden"
                disabled={true}
                checked={checkBoxState[item.id] || false}
              />
            <div
              className={`w-5 h-5 rounded-sm flex items-center justify-center border-2 ${
                checkBoxState[item.id]
                  ? "bg-green-600 border-green-600"
                  : "bg-gray-600 border-gray-400"
              }`}
            >
              {checkBoxState[item.id] && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <label
              htmlFor={item.id}
              className={`font-medium ${
                checkBoxState[item.id] ? "text-green-500" : "text-white"
              }`}
            >
            {item.name}
            </label>
        </div>
            ))}
          </div>

          <div className="flex flex-col items-center space-y-6">
            <div className="w-24 h-24 bg-gray-200 rounded-full">
                <img
                    src="src/assets/images/AI_Assistant.png"
                    alt="Profile"
                    className="w-full h-full object-cover"
                />
            </div>
            <p className="text-lg font-semibold text-white">Sage</p>
            <div className="flex items-center space-x-1">
              {[...Array(16)].map((_, index) => (
                <div
                  key={index}
                  className={`w-0.5 h-8 bg-gray-400 ${
                    wenRTCState && !isLoading ? "animate-wave" : ""
                  }`}
                  style={{
                    animationDelay: `${index * 0.1}s`,
                    transformOrigin: "bottom",
                  }}
                ></div>
              ))}
              <style>
                {`
                  @keyframes wave {
                    0%, 100% {
                      transform: scaleY(1);
                    }
                    50% {
                      transform: scaleY(1.8);
                    }
                  }
                  .animate-wave {
                    animation: wave 1.2s ease-in-out infinite;
                  }
                `}
              </style>
            </div>
          </div>
          <button
            onClick={handleClick}
            disabled={isLoading}
            className={`w-64 px-6 py-3 rounded-lg text-white font-medium shadow-md ${
              wenRTCState
                ? "bg-red-500 hover:bg-red-600"
                : "bg-blue-500 hover:bg-black-600"
            }`}
          >
            {isLoading
              ? "Starting session..."
              : wenRTCState
              ? "Session Active. Say hello!"
              : "Begin Interactive Lesson"}
          </button>
          <div ref={audioDivRef} />
        </div>
      </div>
    </div>
  );
}

export default RealtimeAiBOTPage