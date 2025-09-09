const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const BACKEND_URL = "https://canva-helpbot.onrender.com:3000";

let currentChatState = 'awaiting_role'; 
let userRole = null; 
let suggestedOptions = [];

const canvasSections = {
    estudiante: ["Anuncios", "Tareas", "Calendario", "Chat", "Colaboraciones", "Conferencias", "Navegación del curso", "Foros de discusión", "ePortfolios", "Archivos", "Navegación global", "Calificaciones", "Bandeja de entrada", "Módulos", "Páginas", "Personas y grupos", "Configuraciones de perfil y del usuario", "Editor de contenido enriquecido", "Evaluaciones", "Servicios web", "Canvas Student para iOS"],
    instructor: ["Anuncios", "Páginas", "Tareas", "Exámenes", "Calificaciones", "Evaluaciones", "Personas", "Módulos", "Archivos", "Configuraciones", "Discusiones", "Resultados", "Rúbricas", "Colaboraciones"],
    administrador: ["Anuncios", "Calendario", "Foros de discusión", "Navegación global", "Bandeja de entrada", "Módulos", "Páginas", "Grupos", "Usuarios", "Cursos", "Subcuentas", "Ajustes de cuenta", "Ajustes de curso", "Notificaciones de curso", "Notificaciones de cuenta", "LTI", "Integraciones", "Analíticas"]
};

// Función auxiliar para añadir mensajes al chat
function appendMessage(text, sender, isHtml = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    if (isHtml) {
        messageDiv.innerHTML = text;
    } else {
        messageDiv.textContent = text;
    }
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Muestra los botones de rol al inicio del chat
function showInitialOptions() {
    let optionsHtml = `
        <p>¡Hola! 👋 Soy tu <strong>Chatbot de Ayuda en Canvas</strong>. Para empezar, dime qué tipo de usuario eres:</p>
        <div class="bot-options">
            <button onclick="selectRole('estudiante')">Estudiante</button>
            <button onclick="selectRole('instructor')">Instructor</button>
            <button onclick="selectRole('administrador')">Administrador</button>
        </div>
    `;
    appendMessage(optionsHtml, 'bot', true);
    currentChatState = 'awaiting_role';
    messageInput.disabled = false;
    document.querySelector('.chat-input-area button').disabled = false;
}

// Maneja la selección de rol del usuario
function selectRole(role) {
    appendMessage(role.charAt(0).toUpperCase() + role.slice(1), 'user');
    userRole = role; 
    currentChatState = 'awaiting_question'; 
    
    setTimeout(() => {
        let response = "";
        switch (role) {
            case 'estudiante':
                response = "¡Perfecto! Estoy aquí para ayudarte. ¿Qué necesitas saber sobre Canvas?";
                break;
            case 'instructor':
                response = "¡Excelente! Estoy listo para apoyarte. ¿Cuál es tu pregunta?";
                break;
            case 'administrador':
                response = "¡Claro que sí! Estoy a tu servicio. ¿En qué puedo ayudarte?";
                break;
        }
        appendMessage(response, 'bot');
        messageInput.disabled = false;
        document.querySelector('.chat-input-area button').disabled = false;
        messageInput.focus();
    }, 1000);
}

// Muestra las opciones sugeridas por el bot
function showSuggestedOptions(options) {
    let optionsHtml = `
        <p>Entiendo, ¿te refieres a algo de esto?:</p>
        <ul>
    `;
    options.forEach((option, index) => {
        optionsHtml += `<li><strong>${index + 1}.</strong> ${option.title}</li>`;
    });
    optionsHtml += `
        </ul>
        <p>Escribe el <strong>número</strong> de la opción que te interesa, o reformula tu pregunta.</p>
    `;
    appendMessage(optionsHtml, 'bot', true);
    currentChatState = 'awaiting_refinement';
    messageInput.disabled = false;
    document.querySelector('.chat-input-area button').disabled = false;
    messageInput.focus();
}

async function handleQuestion(messageText) {
    appendMessage("Buscando respuestas...", 'bot');

    try {
        const sections = canvasSections[userRole].join(', ');
        const response = await fetch(`${BACKEND_URL}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: messageText, role: userRole, sections: sections })
        });
        const data = await response.json();
        
        chatMessages.lastChild.remove(); 

        if (data.status === 'options_found') {
            suggestedOptions = data.data;
            showSuggestedOptions(suggestedOptions);
        } else if (data.status === 'section_found') {
            appendMessage(`Parece que tu pregunta está relacionada con <strong>${data.data}</strong>. Si es así, dime "sí" y buscaré en esa sección. Si no, intenta reformular tu pregunta.`, 'bot', true);
            currentChatState = 'awaiting_section_confirmation';
            messageInput.disabled = false;
            document.querySelector('.chat-input-area button').disabled = false;
            messageInput.focus();
        } else { // status === 'no_match'
            appendMessage("Lo siento, no encontré un artículo que responda directamente a tu pregunta. Te sugiero usar el buscador de la comunidad de Canvas o contactar a la Coordinación de Innovación Educativa.", 'bot');
            setTimeout(() => {
                const continueQuestion = "¿Te gustaría hacer otra pregunta?";
                const continueOptions = `<div class="bot-options"><button onclick="restartChat()">✅ Sí, otra pregunta</button><button onclick="endChat()">❌ No, gracias</button></div>`;
                appendMessage(continueQuestion + continueOptions, 'bot', true);
                currentChatState = 'awaiting_menu_choice';
            }, 1000);
        }

    } catch (error) {
        console.error("Error al comunicarse con el backend:", error);
        chatMessages.lastChild.remove(); 
        appendMessage("Lo siento, hubo un problema al buscar tu respuesta. Por favor, inténtalo de nuevo más tarde.", 'bot');
        messageInput.disabled = false;
        document.querySelector('.chat-input-area button').disabled = false;
    }
}

// Envía el mensaje del usuario y maneja los estados del chat
async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (messageText === '') return;

    appendMessage(messageText, 'user');
    messageInput.value = '';

    if (currentChatState === 'awaiting_role') {
        appendMessage("Por favor, selecciona tu rol usando uno de los botones de arriba.", 'bot');
        return;
    }

    messageInput.disabled = true;
    document.querySelector('.chat-input-area button').disabled = true;
    
    // Lógica principal basada en el estado
    if (currentChatState === 'awaiting_question') {
        handleQuestion(messageText);
    } else if (currentChatState === 'awaiting_refinement') {
        // Lógica para reconocer si es un número o texto libre
        const userChoiceNum = parseInt(messageText);
        let urlToSummarize = null;
        
        if (userChoiceNum > 0 && userChoiceNum <= suggestedOptions.length) {
            urlToSummarize = suggestedOptions[userChoiceNum - 1].url;
        } else {
            // Si no es un número, enviamos la respuesta al backend para que la IA la analice
            appendMessage("Entendiendo tu respuesta...", 'bot');
            try {
                const refineResponse = await fetch(`${BACKEND_URL}/refineSearch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText, options: suggestedOptions })
                });
                const refineData = await refineResponse.json();
                chatMessages.lastChild.remove();

                if (refineData.status === 'match_found') {
                    urlToSummarize = refineData.url;
                }
            } catch (error) {
                console.error("Error al refinar la búsqueda en el backend:", error);
                chatMessages.lastChild.remove();
                appendMessage("Lo siento, hubo un problema al procesar tu respuesta.", 'bot');
            }
        }
        
        // Si se encontró una URL, ya sea por número o por texto libre, continuamos
        if (urlToSummarize) {
            appendMessage("Obteniendo resumen...", 'bot');
            try {
                const summaryResponse = await fetch(`${BACKEND_URL}/getSummary`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: urlToSummarize })
                });
                const summaryData = await summaryResponse.json();
                chatMessages.lastChild.remove();

                const finalResponse = `${summaryData.resumen}<br><br>Para más información, visita: <a href="${urlToSummarize}" target="_blank">Ver artículo completo</a>`;
                appendMessage(finalResponse, 'bot', true);

                setTimeout(() => {
                    const continueQuestion = "¿Te gustaría hacer otra pregunta?";
                    const continueOptions = `<div class="bot-options"><button onclick="restartChat()">✅ Sí, otra pregunta</button><button onclick="endChat()">❌ No, gracias</button></div>`;
                    appendMessage(continueQuestion + continueOptions, 'bot', true);
                    currentChatState = 'awaiting_menu_choice';
                }, 1000);

            } catch (error) {
                console.error("Error al obtener el resumen:", error);
                chatMessages.lastChild.remove();
                appendMessage("Lo siento, no pude obtener el resumen de ese artículo. Por favor, intenta con otra opción.", 'bot');
                messageInput.disabled = false;
                document.querySelector('.chat-input-area button').disabled = false;
            }
        } else {
            appendMessage("<strong>Opción inválida.</strong> Por favor, ingresa el <strong>número</strong> de la opción que te interesa o intenta reformular tu respuesta para que sea más clara.", 'bot', true);
            messageInput.disabled = false;
            document.querySelector('.chat-input-area button').disabled = false;
        }

    } else if (currentChatState === 'awaiting_section_confirmation') {
        if (messageText.toLowerCase().includes("sí") || messageText.toLowerCase().includes("si")) {
            const refinedQuestion = suggestedOptions[0].data;
            await handleQuestion(refinedQuestion);
        } else {
            appendMessage("Entiendo. Por favor, reformula tu pregunta. Por ejemplo: 'Necesito ayuda con el calendario de Canvas'.", 'bot');
            currentChatState = 'awaiting_question';
            messageInput.disabled = false;
            document.querySelector('.chat-input-area button').disabled = false;
            messageInput.focus();
        }
    }
}

// Reinicia el chat al estado inicial
function restartChat() {
    appendMessage('✅ Sí, otra pregunta', 'user');
    userRole = null;
    currentChatState = 'awaiting_role';
    setTimeout(() => {
        showInitialOptions();
        messageInput.disabled = false;
        document.querySelector('.chat-input-area button').disabled = false;
        messageInput.focus();
    }, 1000);
}

// Finaliza el chat
function endChat() {
    appendMessage('❌ No, gracias', 'user');
    const goodbyeMessage = "Ha sido un placer ayudarte. ¡Adiós! 👋<br><br>Si tienes más dudas, puedes contactar a la Coordinación de Innovación Educativa a su correo: <a href='mailto:rie@iest.edu.mx'>rie@iest.edu.mx</a>";
    appendMessage(goodbyeMessage, 'bot', true);
    currentChatState = 'finished';
    messageInput.disabled = true;
    document.querySelector('.chat-input-area button').disabled = true;
}

// Para manejar la tecla Enter en el input
function handleKeyPress(event) {
    if (event.key === 'Enter' && !messageInput.disabled) {
        sendMessage();
    }
}

// Muestra el saludo y las opciones iniciales cuando se carga el chat
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        showInitialOptions();
    }, 500);
});