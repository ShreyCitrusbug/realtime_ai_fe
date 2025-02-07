// External imports
import React, { useState, useRef } from "react";

interface ICheckBox{
  name:string
}

// interface IUserMessage{
//   identity : {
//     name : string,
//     birthDate : string
//   }
// }

const RealtimeAiBOTPage : React.FC =()=>{
    const [wenRTCState,setWebRTCState] = useState<boolean>(false)
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const [isLoading,setIsLoading] = useState<boolean>(false)
    // const [userMessage,setUserMessage] = useState<IUserMessage>({identity : {name : "",birthDate : ""}})

    // Playing model's audio 
    const audioDivRef = useRef<HTMLDivElement>(null);

    // Function calling states
    const [checkBoxState, setCheckBoxState] = useState<Record<string,boolean>>({});

    const date = new Date().toLocaleDateString()
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
            // console.log(message,"message");
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
                        console.log(error)
                    })
                })
            })
        }).catch((error)=>{
            console.log(error)
        })
        setWebRTCState(true)

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
            stopWebRTC()
            setWebRTCState(false)
        }
    }
return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-6 px-4">
      {/* Header Section */}
      <header className="w-full max-w-5xl flex items-center justify-between mb-8">
        <div className="flex items-center space-x-2">
          <img
            src="/logo.png"
            alt="Realtime AI"
            className="h-12 w-12"
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Realtime AI</h1>
            <p className="text-sm text-gray-500">Do No Harm</p>
          </div>
        </div>
        <span className="text-gray-600 text-sm">{date}</span>
      </header>

      {/* Main Section */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Call Agenda Section */}
        <div className="bg-white shadow-md rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Call Agenda</h2>
          <ul className="space-y-4">
            {checkBoxItems.map(
              (item, index) => (
                <li key={index} className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id={item.id}
                    className={`w-5 h-5 border-gray-300 rounded ${
                      checkBoxState[item.id] ? "text-blue-600 focus:ring-blue-500" : "text-gray-400"
                    }`}
                    disabled={true}
                    checked={checkBoxState[item.id] || false}
                  />
                  <label
                    htmlFor={item.id}
                    className="text-gray-700 font-medium cursor-pointer"
                  >
                    {item.name}
                  </label>
                </li>
              )
            )}
          </ul>
        </div>

        {/* Patient Info Section */}
        <div className="bg-white shadow-md rounded-2xl p-6">
          <div className="flex items-center space-x-4 mb-6">
            <img
              src="/ai-avatar.png" // Replace with your AI avatar path
              alt="AI Avatar"
              className="h-20 w-20 rounded-full object-cover"
            />
            <div>
              <h3 className="text-xl font-semibold text-gray-800">Verse</h3>
              <p className="text-gray-500 text-sm">AI Assistant</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-600">Fictional Patient Info</h4>
              <ul className="text-gray-700 text-sm">
                <li>Patient Name: Jane</li>
                <li>Gender: Female</li>
                <li>Age: 74</li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-600">Health History</h4>
              <p className="text-gray-700 text-sm">
                Discharged from the hospital 3 days ago following an acute CHF
                exacerbation.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-600">Medication List</h4>
              <ul className="text-gray-700 text-sm list-disc list-inside">
                {[
                  "Lasix",
                  "Digoxin",
                  "Enalapril",
                  "Metformin",
                  "Riboflavin",
                  "Atorvastatin",
                  "Tramadol",
                  "Levothyroxine",
                ].map((medication, index) => (
                  <li key={index}>{medication}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <footer className="mt-10">
        <button
          onClick={handleClick}
          disabled={isLoading}
          className={`px-6 py-3 rounded-lg text-white font-medium shadow-md ${
            wenRTCState ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-black-600"
          }`}
        >
          {isLoading
              ? "Starting session..."
              : wenRTCState
              ? "Session Active"
              : "Begin Interactive Lesson"}
        </button>
        <div ref={audioDivRef} />
      </footer>
    </div>
  );
}

export default RealtimeAiBOTPage