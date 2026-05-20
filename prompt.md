We are preparing for a competition called The Vibe Games, where I am competing as one of three competitors using agentic AI to build an application for social good. The competitors will have 2 hours to rapidly create and present a solution to a problem, and get juried and judges based on creativity, effectiveness, use of agents, and impact.

I've provided a .env file for you to start with, which has 
Postgres DB
Vertex AI for Claude
OpenAI for inference as well as image generation
ElevenLabs for voice (STT or TTS)
ElevenLabs custom voice id 
Google SSO

The challenges will be revealed at the start, and I will tell you below.
For this challenge, we will be using our tech stack:
- Vue.js for the frontend. Depending on the application, we can use CDN or a full Vue.js Vite application.
- Node.js for the backend
- Render.com for the hosting (deployed via GitHub)
- GitHub for the final /app we build and deploy, which I will wire in to publish through Render.com via a Github deployment. This is the repo: https://github.com/developmentation/vibe-games.git

I've added my trusty AI Harness here, which has a template/public/ folder with our prebuild Vue.js frontend and backend which is preconfigured, with  .env setup with database string and the Google SSO already populated.

Always use the style guide here in any copy / content you create: 00-writing-style-guide.md. This will ensure the content isn't typical AI "smell". 

Here is what I anticipate in the Vibe Games. I anticipate a social challenge, where we will need to process data and stage it into the database. We will need to be able ot process a range o ffiles and types, from Excel XLSX CSV through image rasterization. 

# PDF Processing
If we get into image rasterization and PDF processing, I have an excellent example project here which does a fantastic job parsing out PDF pages, using pdfjs and tesseract to assist in the OCR, and then using Opus and Sonnet to do the markdown generation from the documents provided.
C:\dev\pronghorn-red\golden\_goa_messaging\EPA-Red-Tape\phase1
(Lift out the pieces you need, but don't modify this code, its for reference)

# Learning and TTS Generation
If we get into audio generation and training, I have an excellent Text to Speech configured here:
C:\dev\pronghorn-red\golden\adhd which uses ElevenLabs and my custom voice, as well as a player, to create interactive training and walk through with timed content.
(Lift out the pieces you need from this, but don't modify this code, its for reference)

# The Challenge Categories

Here are the predefined categories for the challenges that they've let me know about ahead of time.

1. Build an AI agent for any high-volume transactional program that ingests applications, validates completeness, and routes each submission to the right reviewer while helping address any gaps.

2. Build an AI agent that acts as the first responder: sorting and classifying tickets, resolving routine issues automatically, and preparing clear responses or escalation summaries when human help is needed.

3. Build an AI agent that assesses students' needs, personalizes learning, and boosts engagement. The solution can be designed for students, parents, and/or teachers, and used inside or outside the classroom to help teachers scale individualized learning.

# Preparation
We are now at the preparation phase. I want you to create 3 local subfolders to challenge-1, challenge-2, challenge-3, which uses the provided Vertex Claude or OpenAI API keys to generate out structured data (JSON arrays with markdown content) as well as images (representing raw user submitted data).

## Challenge 1 Preparation
I want you to build these now with scripts to generate this prep content. In Challenge 1, I want you to use the openai API to generate 100 sample applicants to Alberta's AISH program. 
https://www.alberta.ca/aish-eligibility
I want you to create a challenge-1 schema and upload these 100 created people, and produce 20 images per person which represent the types of documents they might submit as part of their application (for example, Alberta ID, driver's license, medical records, financial statements, etc). These can be generated using the OpenAI image generation API, and should be stored in a way that they can be easily retrieved and associated with the correct applicant.

## Challenge 2 Preparation
In Challenge 2, I want you to build out a set of sample support tickets for a fictional company. These tickets should cover a range of common issues that customers might face, such as billing problems, technical issues, and account management questions. Each ticket should include a description of the issue, the customer's contact information, and any relevant metadata (such as the date the ticket was submitted, the priority level, etc). I want you to generate at least 200 sample tickets using Vertex Claude API with a ZOD schema and tool enforcement.

## Challenge 3 Preparation
For this challenge, I want to draw from the Alberta Education curriculum. I've already done an extensive amount of analysis on this, and prepared this in a Phase 1 and Phase 2 dataset.
C:\dev\pronghorn-red\golden\_l3\challenges\alberta-k12-curriculum
postgresql://alberta_curriculum_extraction_f1c24832_user:fak2nVuDfnFRWM4oIwlvvUxnSQpcCQN5@dpg-d7n3fcho3t8c73ef5eqg-b.replica-cyan.oregon-postgres.render.com/alberta_curriculum_extraction_f1c24832

This is a pre-processed dataset of the entire Alberta curriculum (read only).

I want you to generate 100 sample students, at various levels of the K12 system, about 1/3 with some sort of complexity (see this to understand complexity https://www.alberta.ca/taking-action-on-classroom-complexity). Build these students with the ASIN (Alberta Student Identification Number) and then develop a grade history for them, showing where they are struggling. Prepopulate the database with this student information so we have these students. If we go with challenge 3, we will use these students as the base and then leverage the pre-processed curriculum to build out custom learning, with lower grade content (if struggling, go down a few grades till marks improve) or if excelling, sample ahead. This will be what we build in the hackathon, for now just prep the students.

## Begin
Build out the prep data for all 3 challenges into our database.
The OpenAI image generation will be the slowest, so use 5-10 parallel agents, save the bytea binaries into the database, index all the tables we create, and we will be ready to rock with sample data for the hackathon. Once I know the challenge, we will be ready to rock.
