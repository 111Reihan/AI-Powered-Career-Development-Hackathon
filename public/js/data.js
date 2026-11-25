// Sample content. Everything here is curated, static data (not AI output).
// Career/skill requirements are illustrative targets, not an official standard.
(function (g) {
  const L = (title, url, kind) => ({ title, url, kind });
  const W3 = 'https://www.w3schools.com/';

  // order: 1 foundations, 2 core, 3 advanced. hpl = typical hours to climb one level.
  const SKILLS = {
    python:   { name: 'Python', order: 1, hpl: 25, res: [L('W3Schools Python tutorial', W3 + 'python/', 'Tutorial'), L('Kaggle Learn: Python', 'https://www.kaggle.com/learn/python', 'Course')], project: 'Write a script that cleans a CSV file and prints a summary report.' },
    sql:      { name: 'SQL & databases', order: 1, hpl: 15, res: [L('W3Schools SQL tutorial', W3 + 'sql/', 'Tutorial'), L('Kaggle Learn: Intro to SQL', 'https://www.kaggle.com/learn/intro-to-sql', 'Course')], project: 'Design a 3-table database for a student club and write 10 queries that answer real questions.' },
    excel:    { name: 'Spreadsheets', order: 1, hpl: 10, res: [L('W3Schools Excel tutorial', W3 + 'excel/', 'Tutorial')], project: 'Build a budget tracker with formulas, a pivot table and one chart.' },
    web:      { name: 'HTML & CSS', order: 1, hpl: 15, res: [L('W3Schools HTML tutorial', W3 + 'html/', 'Tutorial'), L('W3Schools CSS tutorial', W3 + 'css/', 'Tutorial')], project: 'Build a responsive one-page personal site.' },
    js:       { name: 'JavaScript', order: 2, hpl: 25, res: [L('W3Schools JavaScript tutorial', W3 + 'js/', 'Tutorial'), L('MDN Learn Web Development', 'https://developer.mozilla.org/en-US/docs/Learn', 'Guide')], project: 'Build a to-do app that saves to local storage.' },
    git:      { name: 'Git & version control', order: 1, hpl: 8, res: [L('W3Schools Git tutorial', W3 + 'git/', 'Tutorial')], project: 'Put one of your projects on GitHub with a clear README and at least 10 meaningful commits.' },
    stats:    { name: 'Statistics & probability', order: 1, hpl: 25, res: [L('Khan Academy: Statistics & probability', 'https://www.khanacademy.org/math/statistics-probability', 'Course'), L('W3Schools Statistics', W3 + 'statistics/', 'Tutorial')], project: 'Take a public dataset, test one hypothesis, and explain the result in plain language.' },
    math:     { name: 'Linear algebra & calculus', order: 1, hpl: 30, res: [L('Khan Academy: Linear algebra', 'https://www.khanacademy.org/math/linear-algebra', 'Course'), L('Khan Academy: Calculus 1', 'https://www.khanacademy.org/math/calculus-1', 'Course')], project: 'Implement gradient descent for a simple line fit from scratch and plot the loss.' },
    viz:      { name: 'Data visualization', order: 2, hpl: 15, res: [L('Kaggle Learn: Data Visualization', 'https://www.kaggle.com/learn/data-visualization', 'Course')], project: 'Produce a 3-chart story from a public dataset with a clear takeaway for each chart.' },
    ml:       { name: 'Machine learning', order: 3, hpl: 35, res: [L('Kaggle Learn: Intro to Machine Learning', 'https://www.kaggle.com/learn/intro-to-machine-learning', 'Course'), L('W3Schools Machine Learning', W3 + 'python/python_ml_getting_started.asp', 'Tutorial')], project: 'Enter a beginner Kaggle competition and document your approach and score.' },
    dsa:      { name: 'Data structures & algorithms', order: 2, hpl: 35, res: [L('W3Schools DSA tutorial', W3 + 'dsa/', 'Tutorial'), L('Harvard CS50', 'https://cs50.harvard.edu/x/', 'Course')], project: 'Solve 20 practice problems and write up the pattern behind each group.' },
    cloud:    { name: 'Cloud & Linux basics', order: 2, hpl: 20, res: [L('roadmap.sh: Linux', 'https://roadmap.sh/linux', 'Roadmap')], project: 'Deploy a small web app to a free cloud tier and document the steps.' },
    design:   { name: 'UI/UX design', order: 1, hpl: 30, res: [L('Google UX Design Certificate (Coursera)', 'https://www.coursera.org/professional-certificates/google-ux-design', 'Course'), L('Laws of UX', 'https://lawsofux.com/', 'Guide')], project: 'Redesign one screen of an app you use and explain each decision.' },
    research: { name: 'User research', order: 2, hpl: 20, res: [L('Nielsen Norman Group: User research', 'https://www.nngroup.com/topic/research-methods/', 'Guide')], project: 'Interview 5 people about a daily problem and summarize the patterns you found.' },
    proto:    { name: 'Prototyping', order: 2, hpl: 20, res: [L('Figma learn', 'https://help.figma.com/hc/en-us/categories/360002051613-Get-started', 'Guide')], project: 'Create a clickable prototype for a 5-screen app and test it with 3 people.' },
    comm:     { name: 'Communication & storytelling', order: 1, hpl: 20, res: [L('Harvard: Data storytelling basics', 'https://online.hbs.edu/blog/post/data-storytelling', 'Article')], project: 'Present a 5-minute talk on a project to friends and collect written feedback.' },
    pm:       { name: 'Product thinking', order: 2, hpl: 25, res: [L('Atlassian: Product management guide', 'https://www.atlassian.com/agile/product-management', 'Guide')], project: 'Write a one-page product spec: problem, users, success metric, scope, risks.' },
    analytics:{ name: 'Product & marketing analytics', order: 2, hpl: 20, res: [L('Google Analytics Academy', 'https://skillshop.withgoogle.com/', 'Course')], project: 'Define 5 metrics for a campaign or app and design one A/B test around them.' },
    security: { name: 'Security fundamentals', order: 1, hpl: 30, res: [L('W3Schools Cyber Security', W3 + 'cybersecurity/', 'Tutorial'), L('TryHackMe: Pre Security', 'https://tryhackme.com/path/outline/presecurity', 'Labs')], project: 'Write a threat model for a login system and list 5 mitigations.' },
    network:  { name: 'Networking', order: 1, hpl: 25, res: [L('Cisco Networking Academy (free intro)', 'https://www.netacad.com/', 'Course')], project: 'Map your home network and explain what each device and port does.' },
    writing:  { name: 'Content & copywriting', order: 1, hpl: 20, res: [L('HubSpot Academy: Content marketing', 'https://academy.hubspot.com/courses/content-marketing', 'Course')], project: 'Write 3 versions of a short ad and a landing page headline, and say which you would test and why.' },
    team:     { name: 'Teamwork & project management', order: 1, hpl: 15, res: [L('Atlassian Agile Coach', 'https://www.atlassian.com/agile', 'Guide')], project: 'Run a 2-week sprint with 3 teammates using a simple task board.' },
    business: { name: 'Business acumen', order: 1, hpl: 20, res: [L('Khan Academy: Entrepreneurship', 'https://www.khanacademy.org/college-careers-more/entrepreneurship2', 'Course')], project: 'Analyze one company: customers, revenue model, competitors, one risk.' },
    backend:  { name: 'APIs & backend', order: 2, hpl: 30, res: [L('W3Schools Node.js tutorial', W3 + 'nodejs/', 'Tutorial'), L('MDN: Server-side website programming', 'https://developer.mozilla.org/en-US/docs/Learn/Server-side', 'Guide')], project: 'Build a REST API with 4 endpoints, input validation and tests.' },
    react:    { name: 'Frontend frameworks (React)', order: 3, hpl: 30, res: [L('W3Schools React tutorial', W3 + 'react/', 'Tutorial'), L('React docs: Learn', 'https://react.dev/learn', 'Guide')], project: 'Build a small app with components, state and a data fetch.' },
    devops:   { name: 'CI/CD & containers', order: 3, hpl: 25, res: [L('Docker: Get started', 'https://docs.docker.com/get-started/', 'Guide'), L('roadmap.sh: DevOps', 'https://roadmap.sh/devops', 'Roadmap')], project: 'Containerize an app and add a CI workflow that runs its tests on every push.' },
    etl:      { name: 'Data pipelines (ETL)', order: 3, hpl: 30, res: [L('Kaggle Learn: Data Cleaning', 'https://www.kaggle.com/learn/data-cleaning', 'Course'), L('W3Schools Pandas tutorial', W3 + 'python/pandas/default.asp', 'Tutorial')], project: 'Write a script that pulls data from a public API, cleans it and loads it into a SQLite database.' },
    testing:  { name: 'Software testing', order: 2, hpl: 15, res: [L('MDN: Tools and testing', 'https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing', 'Guide'), L('Python unittest docs', 'https://docs.python.org/3/library/unittest.html', 'Docs')], project: 'Add unit tests to an earlier project and fix at least two bugs they reveal.' },
    techwrite:{ name: 'Technical writing', order: 1, hpl: 15, res: [L('Google Technical Writing courses', 'https://developers.google.com/tech-writing', 'Course')], project: 'Write a README and a how-to guide for one of your projects, then watch a beginner try to follow it.' },
    reqs:     { name: 'Requirements analysis', order: 2, hpl: 20, res: [L('Atlassian: User stories', 'https://www.atlassian.com/agile/project-management/user-stories', 'Guide')], project: 'Interview one stakeholder and write 10 user stories with acceptance criteria.' },
    a11y:     { name: 'Web accessibility', order: 2, hpl: 12, res: [L('W3C WAI: Accessibility fundamentals', 'https://www.w3.org/WAI/fundamentals/accessibility-intro/', 'Guide'), L('web.dev: Learn Accessibility', 'https://web.dev/learn/accessibility', 'Course')], project: 'Audit one web page using only the keyboard and fix five issues you find.' },
  };

  // Interest tags shown in onboarding.
  const INTERESTS = {
    data: 'Data & analytics', ai: 'AI & machine learning', software: 'Building software',
    design: 'Design & user experience', business: 'Business & products', security: 'Security & systems',
    creative: 'Writing & marketing', people: 'Working with people',
  };

  // style = how analytical / creative / social / hands-on technical the role feels (1-5).
  const CAREERS = [
    { id: 'data-scientist', title: 'Data Scientist', icon: '📊', tagline: 'Turn messy data into decisions with statistics and models.',
      about: 'Data scientists explore data, test ideas statistically, and build models that predict or explain outcomes. Expect a mix of coding, maths and explaining results to non-experts.',
      interests: { data: 3, ai: 2, business: 1 }, style: { analytical: 5, creative: 3, social: 2, technical: 4 },
      reqs: { python: 3, stats: 3, sql: 3, ml: 2, viz: 2, math: 2, comm: 2, git: 1 },
      capstone: 'Predict an outcome from a public dataset end to end: question, cleaning, model, evaluation, and a 1-page write-up.' },
    { id: 'ml-engineer', title: 'Machine Learning Engineer', icon: '🧠', tagline: 'Build and ship intelligent systems that run reliably.',
      about: 'ML engineers turn models into working products: data pipelines, training code, deployment and monitoring. It leans more towards software engineering than research.',
      interests: { ai: 3, software: 2, data: 1 }, style: { analytical: 4, creative: 2, social: 2, technical: 5 },
      reqs: { python: 4, ml: 3, math: 3, dsa: 2, git: 2, cloud: 2, stats: 2, sql: 1 },
      capstone: 'Train a small model, wrap it in an API, deploy it, and document how you would monitor it.' },
    { id: 'data-analyst', title: 'Data Analyst', icon: '🔍', tagline: 'Find the story in numbers and help teams act on it.',
      about: 'Data analysts answer business questions with queries, spreadsheets and dashboards, then explain what the numbers mean. A strong first step into data careers.',
      interests: { data: 3, business: 2, creative: 1 }, style: { analytical: 5, creative: 3, social: 3, technical: 3 },
      reqs: { sql: 3, excel: 3, viz: 3, stats: 2, python: 2, comm: 3, business: 2 },
      capstone: 'Build a dashboard answering 3 business questions from a public dataset, with a short written recommendation.' },
    { id: 'software-engineer', title: 'Software Engineer', icon: '💻', tagline: 'Design, build and maintain software people use.',
      about: 'Software engineers write and review code, design systems and fix problems in production. Roles range from web apps to infrastructure.',
      interests: { software: 3, ai: 1, security: 1 }, style: { analytical: 4, creative: 3, social: 2, technical: 5 },
      reqs: { python: 3, js: 2, dsa: 3, git: 3, sql: 2, cloud: 2, team: 2 },
      capstone: 'Build and deploy a full-stack app with tests, a README, and at least one real user.' },
    { id: 'product-designer', title: 'Product / UX Designer', icon: '🎨', tagline: 'Shape how products look, feel and work for people.',
      about: 'Product designers research user problems, sketch and prototype solutions, and refine them with feedback. Empathy and craft matter as much as tools.',
      interests: { design: 3, people: 2, creative: 1 }, style: { analytical: 2, creative: 5, social: 4, technical: 2 },
      reqs: { design: 4, research: 3, proto: 3, web: 1, comm: 3, team: 2 },
      capstone: 'Complete a case study: research, problem statement, prototype, usability test, and what you changed after.' },
    { id: 'product-manager', title: 'Product Manager', icon: '🧭', tagline: 'Decide what to build and why, and align the team behind it.',
      about: 'Product managers connect customer needs, business goals and engineering effort. The job is mostly communication, prioritisation and learning from data.',
      interests: { business: 3, people: 2, data: 1 }, style: { analytical: 3, creative: 3, social: 5, technical: 2 },
      reqs: { pm: 4, analytics: 3, comm: 4, research: 2, business: 3, team: 3, sql: 1 },
      capstone: 'Write a product spec and success metrics for a feature, then pitch it to peers and record their objections.' },
    { id: 'security-analyst', title: 'Cybersecurity Analyst', icon: '🛡️', tagline: 'Detect threats and protect systems and people.',
      about: 'Security analysts monitor systems, investigate alerts and harden defences. It rewards curiosity, patience and a solid grasp of how systems fit together.',
      interests: { security: 3, software: 1, data: 1 }, style: { analytical: 5, creative: 2, social: 2, technical: 5 },
      reqs: { security: 4, network: 3, cloud: 2, python: 2, git: 1, comm: 2 },
      capstone: 'Complete a beginner capture-the-flag path and write up how you solved three challenges.' },
    { id: 'marketing-analyst', title: 'Digital Marketing Analyst', icon: '📣', tagline: 'Understand audiences and measure what campaigns achieve.',
      about: 'Marketing analysts combine writing, analytics and experiments to find out what attracts and keeps customers.',
      interests: { creative: 3, business: 2, data: 2 }, style: { analytical: 4, creative: 4, social: 3, technical: 2 },
      reqs: { analytics: 3, excel: 3, writing: 3, viz: 2, business: 3, comm: 3, sql: 1 },
      capstone: 'Plan a small campaign for a real student club, define metrics, run it for 2 weeks and report results.' },
    { id: 'frontend-developer', title: 'Frontend Developer', icon: '🖥️', tagline: 'Build the parts of websites and apps people see and use.',
      about: 'Frontend developers turn designs into fast, accessible interfaces using HTML, CSS, JavaScript and frameworks. They work closely with designers and backend developers.',
      interests: { software: 3, design: 2, creative: 1 }, style: { analytical: 3, creative: 4, social: 3, technical: 5 },
      reqs: { web: 3, js: 3, react: 2, git: 2, a11y: 2, design: 1, testing: 1 },
      capstone: 'Build and deploy a responsive, accessible web app with a README and a live link.' },
    { id: 'backend-developer', title: 'Backend Developer', icon: '⚙️', tagline: 'Build the servers, APIs and databases behind products.',
      about: 'Backend developers design APIs, store and retrieve data, and keep services reliable and secure. The work is mostly invisible to users but everything depends on it.',
      interests: { software: 3, data: 1, security: 1 }, style: { analytical: 4, creative: 2, social: 2, technical: 5 },
      reqs: { python: 3, backend: 3, sql: 3, git: 3, testing: 2, cloud: 2, dsa: 2 },
      capstone: 'Ship a documented REST API with a database, tests and a deployed demo.' },
    { id: 'data-engineer', title: 'Data Engineer', icon: '🏗️', tagline: 'Build the pipelines that deliver clean data to everyone else.',
      about: 'Data engineers move, clean and store data at scale so analysts and scientists can trust it. It blends software engineering with databases.',
      interests: { data: 3, software: 2 }, style: { analytical: 4, creative: 2, social: 2, technical: 5 },
      reqs: { python: 3, sql: 4, etl: 3, cloud: 2, git: 2, dsa: 1, devops: 1 },
      capstone: 'Build an automated pipeline from a public API to a database, with a short data-quality report.' },
    { id: 'devops-engineer', title: 'DevOps / Cloud Engineer', icon: '☁️', tagline: 'Make software easy and safe to ship and run.',
      about: 'DevOps and cloud engineers automate builds, deployments and infrastructure, and keep systems monitored and reliable.',
      interests: { software: 2, security: 2 }, style: { analytical: 4, creative: 2, social: 2, technical: 5 },
      reqs: { cloud: 3, devops: 3, git: 3, python: 2, network: 2, security: 1, testing: 1 },
      capstone: 'Containerize an app, deploy it to a free cloud tier and automate deployment with CI.' },
    { id: 'business-analyst', title: 'Business Analyst', icon: '📋', tagline: 'Translate business needs into clear requirements and decisions.',
      about: 'Business analysts work with stakeholders to understand problems, document requirements and help teams choose the right solution.',
      interests: { business: 3, people: 2, data: 1 }, style: { analytical: 4, creative: 2, social: 5, technical: 2 },
      reqs: { reqs: 3, excel: 3, sql: 2, comm: 3, business: 3, team: 2, viz: 2 },
      capstone: 'Write a requirements document and process map for a real problem at a student club or small business.' },
    { id: 'ux-researcher', title: 'UX Researcher', icon: '🔬', tagline: 'Learn what people really need and why they struggle.',
      about: 'UX researchers run interviews, surveys and usability tests, then turn findings into insights that shape what gets built.',
      interests: { people: 3, design: 2, data: 1 }, style: { analytical: 4, creative: 3, social: 5, technical: 1 },
      reqs: { research: 4, comm: 3, analytics: 2, design: 2, stats: 1, team: 2 },
      capstone: 'Run a small research study: plan, 5 interviews, synthesis and a recommendations deck.' },
    { id: 'technical-writer', title: 'Technical Writer', icon: '✍️', tagline: 'Make complex products understandable through clear writing.',
      about: 'Technical writers create documentation, guides and tutorials. They need to understand technology and explain it simply.',
      interests: { creative: 3, software: 1, people: 1 }, style: { analytical: 3, creative: 4, social: 3, technical: 3 },
      reqs: { techwrite: 4, writing: 2, git: 2, web: 1, comm: 3, team: 1 },
      capstone: 'Document an open-source project: a getting-started guide, three how-tos and a pull request.' },
  ];


  // Quick checks: 3 questions per skill; number correct (0-3) suggests a level. Self-rating stays editable.
  const Q = (q, o, a) => ({ q, o, a });
  // Logos: 'brand:*' = real technology logo, 'glyph:*' = generic icon (see icons.js).
  const LOGO = {
    skill: { python: 'brand:python', sql: 'brand:postgresql', excel: 'brand:googlesheets', web: 'brand:html5', js: 'brand:javascript', git: 'brand:git', stats: 'glyph:sigma', math: 'glyph:pi', viz: 'glyph:chart-column', ml: 'brand:tensorflow', dsa: 'glyph:binary', cloud: 'brand:linux', design: 'brand:figma', research: 'glyph:search', proto: 'brand:figma', comm: 'glyph:message-square', pm: 'brand:jira', analytics: 'brand:googleanalytics', security: 'glyph:shield-check', network: 'glyph:globe', writing: 'glyph:pen-line', team: 'glyph:users', business: 'glyph:briefcase', backend: 'brand:nodedotjs', react: 'brand:react', devops: 'brand:docker', etl: 'brand:pandas', testing: 'glyph:test-tube', techwrite: 'glyph:file-text', reqs: 'glyph:clipboard-list', a11y: 'glyph:accessibility' },
    career: { 'data-scientist': 'glyph:flask-conical', 'ml-engineer': 'glyph:brain', 'data-analyst': 'glyph:chart-column', 'software-engineer': 'glyph:code', 'product-designer': 'brand:figma', 'product-manager': 'glyph:compass', 'security-analyst': 'glyph:shield', 'marketing-analyst': 'glyph:megaphone', 'frontend-developer': 'brand:react', 'backend-developer': 'brand:nodedotjs', 'data-engineer': 'glyph:database', 'devops-engineer': 'brand:docker', 'business-analyst': 'glyph:clipboard-list', 'ux-researcher': 'glyph:microscope', 'technical-writer': 'glyph:pen-line' },
    interest: { data: 'glyph:chart-column', ai: 'glyph:brain', software: 'glyph:code', design: 'glyph:palette', business: 'glyph:briefcase', security: 'glyph:shield', creative: 'glyph:pen-line', people: 'glyph:users' },
  };

  const LEVELS = ['None', 'Aware', 'Basic', 'Solid', 'Strong'];
  const STYLES = { analytical: 'Analytical thinking', creative: 'Creative work', social: 'Working with people', technical: 'Hands-on technical building' };

  g.OrbitData = { SKILLS, INTERESTS, CAREERS, LEVELS, STYLES, LOGO };
})(typeof window !== 'undefined' ? window : globalThis);
