import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function getDisneyNews() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "URGENT: Provide a list of the 5 most important status updates or news items for Disneyland California right now (park hours, weather impacts, or ride delays). Return a valid JSON array of objects: {title, content, severity: 'info'|'warning'|'critical'}.",
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });
    // Handle cases where the model returns markdown or text
    const text = response.text || '[]';
    return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch (error) {
    console.error("Disney news error:", error);
    return [{ 
      title: "Disneyland Daily Update", 
      content: "Park standard hours are 8:00 AM to 10:00 PM. Please check the Disneyland app for real-time attraction standby times and mobile food ordering.", 
      severity: "info" 
    }];
  }
}

export async function getPlaceSuggestions(lat: number, lng: number, type: 'food' | 'site') {
  try {
    const prompt = type === 'food' 
      ? `QUICK: List 3 unique, family-friendly food spots near ${lat}, ${lng} (California). JSON array: {name, description, rating, distance, coordinates: {lat, lng}}.`
      : `QUICK: List 3 must-see roadside sites near ${lat}, ${lng} (California road trip). JSON array: {name, description, significance, distance, coordinates: {lat, lng}}.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Suggestions error:", error);
    return [];
  }
}

export async function getTrafficReport(lat: number, lng: number) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `QUICK: Current traffic status near ${lat}, ${lng} (CA). Any major delays? JSON: {status: 'clear'|'minor'|'major', incidents: [{title, description, impact}], recommendations: [string]}.`,
      config: {
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }]
      }
    });
    return JSON.parse(response.text || '{"status": "clear", "incidents": [], "recommendations": []}');
  } catch (error) {
    console.error("Traffic error:", error);
    return { status: 'unknown', incidents: [], recommendations: [] };
  }
}
