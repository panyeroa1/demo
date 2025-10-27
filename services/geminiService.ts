import { GoogleGenAI, GenerateContentResponse, GroundingMetadata, Modality, Content, Part } from "@google/genai";
import { ChatMessage } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const EBURON_ERROR_MESSAGE = "The Eburon.ai service encountered an error. Please try again.";

const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
}

export const sendMessageStreamToGemini = async (
    history: ChatMessage[], 
    newMessage: string, 
    imageFile: File | null, 
    useSearchGrounding: boolean,
    systemPrompt: string
): Promise<AsyncIterable<GenerateContentResponse>> => {
    try {
        // FIX: Updated model to be more specific as per guidelines for text tasks.
        const modelName = 'gemini-2.5-flash';
        
        const contents: Content[] = history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }],
        }));

        const userParts: Part[] = [{ text: newMessage }];
        if (imageFile) {
            const imagePart = await fileToGenerativePart(imageFile);
            userParts.push(imagePart);
        }
        contents.push({ role: 'user', parts: userParts });

        const config: any = {
            systemInstruction: systemPrompt
        };

        if (useSearchGrounding) {
            config.tools = [{ googleSearch: {} }];
        }

        return ai.models.generateContentStream({
            model: modelName,
            contents,
            config,
        });
    } catch (error) {
        console.error("Eburon AI Service Error (Stream):", error);
        throw new Error(EBURON_ERROR_MESSAGE);
    }
};

export const generateImageWithGemini = async (
    prompt: string,
    imageFile: File | null
): Promise<string> => {
    try {
        const parts: Part[] = [{ text: prompt }];
        if (imageFile) {
            const imagePart = await fileToGenerativePart(imageFile);
            parts.unshift(imagePart); // Image comes first for editing
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                const mimeType = part.inlineData.mimeType;
                const base64ImageBytes: string = part.inlineData.data;
                return `data:${mimeType};base64,${base64ImageBytes}`;
            }
        }

        throw new Error("No image data was found in the Eburon.ai response.");

    } catch (error) {
        console.error("Eburon AI Service Error (Image Gen):", error);
        throw new Error(EBURON_ERROR_MESSAGE);
    }
}
