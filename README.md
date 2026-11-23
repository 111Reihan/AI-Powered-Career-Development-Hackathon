# AI-Powered-Career-Development-Hackathon

## Orbit — Your career, in motion

Orbit is a student-first career discovery MVP for the Build Your Career AI Hackathon. It turns career exploration into a simple loop: understand your starting point, explore possible roles, find the skills to grow, and take a manageable next step.

## Run it

Open `index.html` in a modern browser. There is no build step, account, API key, or install required. The profile form saves its data in the browser's local storage.

## What works in this MVP

- Responsive career dashboard with career matches, a skill profile, readiness indicators, and a learning roadmap.
- Profile setup for a student's name, field of study, career interest, and weekly learning time.
- A personalized career snapshot that uses those inputs to suggest a direction and a concrete next step.
- Navigation between career paths, skills, the learning plan, and settings.
- Saved profile data on the current device, with no data sent to a server.

## Personalization and AI

This is a front-end concept MVP. Its snapshot uses a transparent, local template based on the student's stated interest and available study time; it does not call a live AI model, and the example match percentages and skill levels are sample dashboard data. This keeps the demo usable without credentials and avoids presenting generated advice as a validated assessment. A production version could replace the local template with an LLM-backed career coach grounded in a maintained role-and-skill dataset, while keeping user consent, citations to learning resources, and editable assumptions in the loop.

## Demo video

Watch the walkthrough of the dashboard, profile setup, personalized snapshot, and learning roadmap:

<video controls width="100%" src="career-demo.webm">Your browser can open the [Orbit demo video](career-demo.webm).</video>

[Open the Orbit demo video](career-demo.webm)

## Hackathon submission

Publish this repository on GitHub and submit its public URL through the Unstop competition portal before the deadline.
