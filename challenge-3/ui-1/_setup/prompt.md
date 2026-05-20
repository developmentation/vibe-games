We are going to build out a custom Claude Code harness for skills files, hooks, and documentation following Anthropic's most up to date best practices for building skills. 

In the end, we will have a .claude directory which contains all the necessary skills to effectively build out Alberta.ca webpages. For these skills, we need to be able to undertake a series of steps.

# Research
Before creating these skills, do a deep research on Anthropic's help information and recent articles on best practices for building out harnessess consting of skills and hooks and standards.

# Extraction
We need to be able to have skills and scripts which download specific pages, doing a deep scrape and then cleansing the results of this to extract out the HTML, JavaScript, and CSS information, as well as any CDN dependencies, style sheets and information needed to build out a webpage.

Alberta.ca is Drupal hosted, so when content is published it needs to be clean and crisp HTML, JavaScript native, and CSS which is aligned to the Government of Alberta style systems. Minimalist, with accessibility and meeting all WCAG standards is essential, and support for individuals using accessibility tools is a must.

# Generation
We must be able to take business requirements, concepts, and opporutnities and use these skills to build out these applications, pages, and content in a way which is aligned to the Alberta.ca style system, and which meets all accessibility requirements.

# Evaluation
The skills and hooks must validate that all necessary checks are performed and passed before declaring an initiative complete.  We need to run a full set of evals which crosswalk the requirements documents / materials to the final created artifacts.

# Hosting
While this will be deployed into Drupal for production, we need to scaffold these prototypes locally for rapid user testing and evaluation. The prototype apps must launch, have clear interactivity, have navigation, be mobile responsive, and allow the user to test the different elements. 

# Human Testing
There should be a generated testing plan which is created as well wihch walks a human user. This will be an important skill as it will provide the humans with a clear checklist .md document of exactly what they need to achieve their work.

# Begin
So, now that we have these elements, I want you to 
1. Do your resarch on the most up to date best practices for building out skills and hooks for a custom Claude Code harness.
2. Read the urls.md file using custom scripts and skills. This skill creation may need to be iterative or recursive, so you can extract, then read, then refine, and then build the next set of skills.
3. Build the skills for the app generation and hosting so I can give you an idea and you create an app folder which scaffolds out the necessary files for a prototype and hosts them in a node.js application. You can also build a reusable template for this.
4. Builds the evaluations needed for the Web team to sign off that these elements are complete, aligned to the standard design system, fully accessible, and ready for deployment.
5. Prepare all necessary skills documentation, readme for this harness, and a main CLAUDE.md file which will sit at the root and expose these skills for the agent to use in the future.