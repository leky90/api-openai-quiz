export type Quiz = {
  question: string;
  choices: [string, string, string, string];
  level:
    | 'Beginner'
    | 'Elementary'
    | 'Intermediate'
    | 'Above Intermediate'
    | 'Advanced'
    | 'Proficient';
  type: string;
};

export type Answer = {
  correct: number[];
  explanation: string;
};

import * as express from 'express';
import * as cors from 'cors';
import * as https from 'https';
import * as bodyParser from 'body-parser';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

const BASE_COUNTDOWN = 20;
const BASE_QUIZ = 5;

const app = express();
app.use(cors());
app.use(bodyParser.json());
const redis = Redis.fromEnv({ agent: new https.Agent({ keepAlive: true }) });

function compareArrays(arr1: number[], arr2: number[]) {
  if (arr1.length !== arr2.length) {
    return false; // Arrays have different lengths
  }

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false; // Values at index i are not equal
    }
  }

  return true; // Arrays are equal
}

app.get('/api/get-quizzes', async (req, res) => {
  const totalHtml = Number(req.query.totalHtml) || BASE_QUIZ;
  const totalJs = Number(req.query.totalJs) || BASE_QUIZ;
  const totalCss = Number(req.query.totalCss) || BASE_QUIZ;
  const totalQuestions = totalCss + totalJs + totalHtml;

  const prompt = `Create ${totalQuestions} multiple choice questions about knowledge of Javascript, CSS, and HTML, the difficulty of the question is "Beginner" or "Elementary" or "Intermediate" or "Above Intermediate" or "Advanced" or "Proficient" questions cannot be duplicated, the number of questions about Javascript is ${totalJs}, the number of questions about HTML is ${totalHtml}, the number of questions about CSS is ${totalCss}, there may be one or more correct options, accompanied by an explanation for the correct answer. Provide output in minify JSON format as follows:
  
  {
      "questions": [{
          question: string,
          choices: [string, string, string, string],
          level: "Beginner" or "Elementary" or "Intermediate" or "Above Intermediate" or "Advanced" or "Proficient",
          type: "Javascript" or "CSS" or "HTML"
      }],
      "answers": [{
          correct: [number, ...],
          explanation: string
      }]
  }`;

  try {
    const chatCompletion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 16000,
      model: 'gpt-3.5-turbo-16k-0613',
      temperature: 1,
    });

    if (!chatCompletion.choices[0].message.content)
      return res.json({ success: false, data: [] });

    const result: { questions: Quiz[]; answers: [] } = JSON.parse(
      chatCompletion.choices[0].message.content
    );
    const questions = result.questions;
    const quizId = chatCompletion.id.replace('chatcmpl-', '');

    redis.set(quizId, result.answers, {
      ex: totalQuestions * (BASE_COUNTDOWN + 5),
    });

    console.log('token usage', chatCompletion.usage);

    return res.json({ success: true, data: { questions, quizId } });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/check-quiz/:quizId', async (req, res) => {
  try {
    const { choices, index } = req.body;
    const quizId = req.params.quizId;
    const answers: Answer[] | null = await redis.get(quizId);

    if (!answers) return res.status(500).json({ success: false });

    const result = compareArrays(answers[index].correct, choices.sort());

    return res.json({
      success: result,
      answer: { ...answers[index], choices },
    });
  } catch (error) {
    return res.status(500).json({ success: false });
  }
});

const port = process.env.port || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});

server.on('error', console.error);
