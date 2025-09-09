import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// --- Reubicación de la configuración de dotenv ---
// Paso 1: Definir las variables de ruta primero
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paso 2: Usar la ruta absoluta para cargar el .env
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
// --- Fin de la reubicación ---

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, '../frontend')));
app.use(cors());
app.use(express.json());

// --- Funciones del Chatbot ---

async function loadKnowledgeBase(role) {
    const filePath = path.join(__dirname, 'data', `${role}.json`);
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Error al cargar el archivo de rol ${role}:`, error);
        return [];
    }
}

async function searchWithGemini(userQuestion, knowledgeBase, sections) {
    if (knowledgeBase.length === 0) {
        return { status: 'no_match', data: null };
    }

    const titles = knowledgeBase.map(item => item.title).join('; ');

    // Primer intento: buscar títulos relevantes
    const titlesPrompt = `El usuario tiene la pregunta: "${userQuestion}".
    Aquí está una lista de títulos de artículos: ${titles}.
    Por favor, identifica y selecciona de 3 a 5 títulos que sean directamente relevantes. Responde ÚNICAMENTE con los títulos seleccionados, separados por un punto y coma. Si no encuentras una buena coincidencia, responde "no_match_titles".`;
    
    try {
        const titlesResult = await model.generateContent(titlesPrompt);
        const titlesResponseText = titlesResult.response.text().trim();

        if (titlesResponseText.toLowerCase() !== 'no_match_titles') {
            const suggestedTitles = titlesResponseText.split(';').map(t => t.trim());
            const suggestedItems = suggestedTitles.map(suggestedTitle => {
                const foundItem = knowledgeBase.find(item => item.title.trim() === suggestedTitle);
                return foundItem;
            }).filter(Boolean);
            
            if (suggestedItems.length > 0) {
                 return { status: 'options_found', data: suggestedItems };
            }
        }
    } catch (error) {
        console.error("Error al buscar títulos con Gemini:", error);
    }

    // Segundo intento: buscar secciones relevantes
    const sectionsPrompt = `El usuario pregunta: "${userQuestion}".
    Aquí está una lista de secciones de Canvas: ${sections}.
    Por favor, identifica la sección más relevante para la pregunta del usuario. Responde ÚNICAMENTE con el nombre de la sección. Si no hay una buena coincidencia, responde "no_match_section".`;

    try {
        const sectionsResult = await model.generateContent(sectionsPrompt);
        const sectionsResponseText = sectionsResult.response.text().trim();

        if (sectionsResponseText.toLowerCase() !== 'no_match_section') {
            return { status: 'section_found', data: sectionsResponseText };
        }
    } catch (error) {
        console.error("Error al buscar secciones con Gemini:", error);
    }

    return { status: 'no_match', data: null };
}

async function getTextFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Error al obtener ${url}: ${response.statusText}`);
            return '';
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        const mainContent = $('.lia-message-body').text() ||
                            $('.body.message-body').text() ||
                            $('article').text() ||
                            $('main').text() ||
                            $('body').text();

        return mainContent.replace(/\s+/g, ' ').trim();
    } catch (error) {
        console.error(`Fallo al procesar ${url}: ${error.message}`);
        return '';
    }
}

async function summarizeText(text) {
    if (!text || text.length < 100) {
        return 'El contenido es demasiado corto para generar un resumen significativo.';
    }

    try {
        const prompt = `Actúa como un asistente de ayuda de Canvas para un usuario. Tu objetivo es transformar el siguiente texto en una guía práctica y coherente, como si se la estuvieras explicando al usuario de manera directa y amigable.

        Instrucciones para la respuesta:
        1.  Usa un tono directo y de ayuda. Elimina cualquier frase que suene a "resumen" o "este texto dice".
        2.  Organiza la información de forma lógica, priorizando los pasos principales.
        3.  Si el texto describe un proceso, conviértelo en una lista ordenada HTML (<ol> y <li>).
        4.  Usa las etiquetas HTML <strong> para resaltar palabras clave, como nombres de secciones o botones.
        5.  Si hay listas que no son de pasos, usa una lista desordenada (<ul> y <li>).
        6.  Asegúrate de que la respuesta sea fluida, cohesiva y fácil de leer.
        7.  No uses sintaxis de Markdown (como #, * o -).
        
        Texto del artículo:
        "${text}"`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        if (summary) {
            return summary;
        } else {
            return 'No se pudo generar un resumen con Gemini. El modelo no devolvió texto.';
        }
    } catch (e) {
        console.error("Error al resumir el texto con Gemini:", e);
        return 'Lo siento, hubo un problema al generar el resumen con Gemini. Por favor, verifica tu API Key y la conexión.';
    }
}

// --- Rutas del Servidor ---

app.post('/ask', async (req, res) => {
    const { message, role, sections } = req.body;

    if (!message || !role || !sections) {
        return res.status(400).json({ error: 'El mensaje, rol y secciones son requeridos.' });
    }

    console.log(`Solicitud de ${role} con pregunta: "${message}"`);
    console.log(`Secciones disponibles: ${sections}`);

    const knowledgeBase = await loadKnowledgeBase(role);
    const searchResult = await searchWithGemini(message, knowledgeBase, sections);

    res.json(searchResult);
});

app.post('/getSummary', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'La URL es requerida.' });
    }

    console.log(`Solicitud de resumen para: ${url}`);
    const pageText = await getTextFromUrl(url);
    const summary = await summarizeText(pageText);

    res.json({ resumen: summary });
});

app.post('/refineSearch', async (req, res) => {
    const { message, options } = req.body;

    if (!message || !options || options.length === 0) {
        return res.status(400).json({ error: 'El mensaje y las opciones son requeridos para refinar la búsqueda.' });
    }

    try {
        const prompt = `El usuario dice: "${message}".
        Aquí está una lista de opciones numeradas:
        ${options.map((opt, i) => `${i + 1}. ${opt.title}`).join('\n')}
        
        ¿A cuál de estas opciones se refiere el usuario? Responde ÚNICAMENTE con el NÚMERO de la opción. Si la respuesta no coincide con ninguna opción, responde "0".`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();
        const matchedNumber = parseInt(responseText);

        if (matchedNumber > 0 && matchedNumber <= options.length) {
            const matchedOption = options[matchedNumber - 1];
            return res.json({ status: 'match_found', url: matchedOption.url });
        } else {
            return res.json({ status: 'no_match' });
        }
    } catch (error) {
        console.error("Error al refinar la búsqueda con Gemini:", error);
        return res.status(500).json({ status: 'error', message: 'Hubo un problema al procesar tu respuesta.' });
    }
});

// Ruta anterior, ya no es el flujo principal
app.post('/summarize', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'La URL es requerida.' });
    }
    console.log(`Solicitud de resumen para: ${url}`);
    const pageText = await getTextFromUrl(url);
    const summary = await summarizeText(pageText);
    res.json({ url: url, resumen: summary });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de resumen ejecutándose en https://canva-helpbot.onrender.com`);
});