const Alexa = require('ask-sdk-core');
const https = require('https');

/* HANDLERS */

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(`Bienvenido a la skill ${SKILL_NAME}. Te puedo ayudar a encontrar tu mejor clase de perro. ` +
        '¿Qué tipo de perro quieres?')
      .reprompt(HELP_REPROMPT)
      .getResponse();
  },
};

const InProgressPetMatchIntent = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'
      && request.intent.name === 'BuscaMascotaIntent'
      && request.dialogState !== 'COMPLETED';
  },
  handle(handlerInput) {
    const currentIntent = handlerInput.requestEnvelope.request.intent;

    return handlerInput.responseBuilder
      .addDelegateDirective(currentIntent)
      .getResponse();
  },
};

const CompletedPetMatchIntent = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'
      && request.intent.name === 'BuscaMascotaIntent';
  },
  async handle(handlerInput) {
    const filledSlots = handlerInput.requestEnvelope.request.intent.slots;

    const slotValues = getSlotValues(filledSlots);
    console.log(`The slot values: ${JSON.stringify(slotValues)}`);
    const petMatchOptions = buildPetMatchOptions(slotValues);
    console.log(petMatchOptions);

    let outputSpeech = '';

    try {
      const response = await httpGet(petMatchOptions);

      if (response.result.length > 0) {
        outputSpeech = `Entonces buscas un perro ${slotValues.tamano.synonym}, 
          ${slotValues.temperamento.synonym} y 
          ${slotValues.energia.synonym}. Te recomiendo un 
          ${response.result[0].breed}`;
      } else {
        outputSpeech = `${randomPhrase(SORRY_MESSAGES)}. No he encontrado un tipo de perro con esas características`;
        //${slotValues.tamano.synonym}, 
          //${slotValues.temperamento.synonym} y
          //${slotValues.energia.synonym}`;
      }
    } catch (error) {
      outputSpeech = `${randomPhrase(SORRY_MESSAGES)}. Me he despistado! Por favor ${RETRY_MESSAGES}`;
      console.log(`Intent: ${handlerInput.requestEnvelope.request.intent.name}: message: ${error.message}`);
      return handlerInput.responseBuilder
          .speak(outputSpeech)
          .reprompt(outputSpeech)
          .getResponse();
    }

    return handlerInput.responseBuilder
      .speak(outputSpeech + '. ' + randomPhrase(BYE_MESSAGES))
      .getResponse();
  },
};

const HelpHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'
      && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(`Estás en ${SKILL_NAME}. Un buscador que te permites encontrar tu perro perfecto.` + 'Puedes indicar el tamaño, nivel de energía y temperamento del perro')
      .reprompt(HELP_REPROMPT)
      .getResponse();
  },
};

const ExitHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;

    return request.type === 'IntentRequest'
      && (request.intent.name === 'AMAZON.CancelIntent'
        || request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(randomPhrase(BYE_MESSAGES))
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${handlerInput.requestEnvelope.request.type} ${handlerInput.requestEnvelope.request.type === 'IntentRequest' ? `intent: ${handlerInput.requestEnvelope.request.intent.name} ` : ''}${error.message}.`);

    return handlerInput.responseBuilder
      .speak(ERROR_MESSAGE)
      .reprompt(ERROR_MESSAGE)
      .getResponse();
  },
};


/* CONSTANTS */

const SKILL_NAME = "busca perro";
const BYE_MESSAGES = ['Hasta la próxima', 'Hasta la vista!', 'Adiós', 'Nos vemos'];
const SORRY_MESSAGES = ['Lo siento', 'Lo lamento', 'Que pena', 'Perdona', 'Lo siento mucho'];
const RETRY_MESSAGES = ['Prueba otra vez', 'Inténtalo otra vez', 'Prueba de nuevo', 'Inténtalo de nuevo', 'Vuelve a intentarlo'];
const HELP_REPROMPT = '¿Qué tamaño, temperamento y energía buscas en un perro?';
const ERROR_MESSAGE = 'Perdona, no te entiendo. Por favor repítemelo.';

const petMatchApi = {
  hostname: 'e4v7rdwl7l.execute-api.us-east-1.amazonaws.com',
  pets: '/Test',
};

/* HELPER FUNCTIONS */

function buildPastMatchObject(response, slotValues) {
  return {
    match: response.result,
    pet: slotValues.mascota.resolved,
    energy: slotValues.energia.resolved,
    size: slotValues.tamano.resolved,
    temperament: slotValues.temperamento.resolved,
  };
}

function getSlotValues(filledSlots) {
  const slotValues = {};

  //console.log(`The filled slots: ${JSON.stringify(filledSlots)}`);
  Object.keys(filledSlots).forEach((item) => {
    const name = filledSlots[item].name;

    if (filledSlots[item] &&
      filledSlots[item].resolutions &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0] &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0].status &&
      filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) {
      switch (filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) {
        case 'ER_SUCCESS_MATCH':
          slotValues[name] = {
            synonym: filledSlots[item].value,
            resolved: filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.name,
            isValidated: true,
          };
          break;
        case 'ER_SUCCESS_NO_MATCH':
          slotValues[name] = {
            synonym: filledSlots[item].value,
            resolved: filledSlots[item].value,
            isValidated: false,
          };
          break;
        default:
          break;
      }
    } else {
      slotValues[name] = {
        synonym: filledSlots[item].value,
        resolved: filledSlots[item].value,
        isValidated: false,
      };
    }
  }, this);

  return slotValues;
}

function randomPhrase(array) {
  return (array[Math.floor(Math.random() * array.length)]);
}

function buildPetMatchParams(slotValues) {
  return [
    ['SSET',
      `canine-${slotValues.energia.resolved}-${slotValues.tamano.resolved}-${slotValues.temperamento.resolved}`],
  ];
}

function buildQueryString(params) {
  let paramList = '';
  params.forEach((paramGroup, index) => {
    paramList += `${index === 0 ? '?' : '&'}${encodeURIComponent(paramGroup[0])}=${encodeURIComponent(paramGroup[1])}`;
  });
  return paramList;
}

function buildHttpGetOptions(host, path, port, params) {
  return {
    hostname: host,
    path: path + buildQueryString(params),
    port,
    method: 'GET',
  };
}

function buildPetMatchOptions(slotValues) {
  const params = buildPetMatchParams(slotValues);
  const port = 443;
  return buildHttpGetOptions(petMatchApi.hostname, petMatchApi.pets, port, params);
}


function httpGet(options) {
  return new Promise(((resolve, reject) => {
    const request = https.request(options, (response) => {
      response.setEncoding('utf8');
      let returnData = '';

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error(`${response.statusCode}: ${response.req.getHeader('host')} ${response.req.path}`));
      }

      response.on('data', (chunk) => {
        returnData += chunk;
      });

      response.on('end', () => {
        resolve(JSON.parse(returnData));
      });

      response.on('error', (error) => {
        reject(error);
      });
    });
    request.end();
  }));
}

/* LAMBDA SETUP */

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    InProgressPetMatchIntent,
    CompletedPetMatchIntent,
    HelpHandler,
    ExitHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
