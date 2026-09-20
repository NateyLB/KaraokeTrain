import json
import sys
import asyncio
import os
import pydantic

try:
    from google.antigravity import Agent, LocalAgentConfig
except ImportError:
    # Fallback mock for when the SDK isn't installed
    # This prevents the app from crashing if google-antigravity is a fictional/unavailable package
    class LocalAgentConfig:
        def __init__(self, response_schema=None, system_instruction=None, api_key=None):
            self.response_schema = response_schema
            self.system_instruction = system_instruction
            self.api_key = api_key

    class AgentResponse:
        def __init__(self, data):
            self.data = data
        async def structured_output(self):
            return self.data

    class MockAgent:
        def __init__(self, config):
            self.config = config
            try:
                from google import genai
                self.client = genai.Client(api_key=config.api_key)
            except ImportError:
                self.client = None
            
        async def chat(self, prompt):
            if self.client and self.config.api_key:
                # Use real Gemini API dynamically
                response = self.client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=[self.config.system_instruction, prompt],
                    config={
                        'response_mime_type': 'application/json',
                        'response_schema': self.config.response_schema,
                    },
                )
                return AgentResponse(json.loads(response.text))
            else:
                # Absolute fallback
                return AgentResponse({
                    "message": "Hey party people! The vibe is amazing right now. Since you're loving this, here are some recommendations to keep the energy going!",
                    "recommended_queries": [
                        "Mr Brightside The Killers",
                        "Sweet Caroline Neil Diamond",
                        "Bohemian Rhapsody Queen",
                        "Uptown Funk Bruno Mars",
                        "I Want It That Way Backstreet Boys",
                        "Don't Stop Believin' Journey",
                        "Livin' on a Prayer Bon Jovi",
                        "Dancing Queen ABBA",
                        "Wonderwall Oasis",
                        "Wannabe Spice Girls"
                    ]
                })
            
        async def __aenter__(self):
            return self
            
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    def Agent(config):
        return MockAgent(config)

class DJRecommendation(pydantic.BaseModel):
    message: str
    recommended_queries: list[str]

async def run_dj_agent(prompt_data_str):
    try:
        session_data = json.loads(prompt_data_str)
        history = session_data.get('history', [])
        current_song = session_data.get('currentSong', {})
        queue = session_data.get('queue', [])
        user_prompt = session_data.get('prompt', "What should we sing next?")
        
        # Build context for the DJ
        history_titles = [f"{s.get('title')} by {s.get('artist')}" for s in history]
        queue_titles = [f"{s.get('title')} by {s.get('artist')}" for s in queue]
        current_title = f"{current_song.get('title')} by {current_song.get('artist')}" if current_song else "Nothing playing"
        
        system_instruction = (
            "You are an energetic, fun Karaoke Session DJ. You read the room and recommend songs. "
            "You are given the history of what has been sung, what is currently playing, and what is coming up next in the queue. "
            "Using this context, reply to the user's prompt with a short, hype message, and exactly 10 YouTube search queries "
            "they can click to queue up next. HOWEVER, if the user explicitly asks for a specific number of songs (e.g., 'give me 3 songs'), "
            "you MUST return exactly that requested number of queries instead of 10. "
            "IMPORTANT: DO NOT append the word 'Karaoke' to your queries. Recommend the ORIGINAL studio version of the songs, because our backend AI engine needs the original vocals to process the stems!"
        )
        
        agent_prompt = (
            f"User Prompt: {user_prompt}\n\n"
            f"--- SESSION CONTEXT ---\n"
            f"Played History: {history_titles}\n"
            f"Currently Playing: {current_title}\n"
            f"Coming Up Next: {queue_titles}\n"
        )
        
        api_key = os.environ.get('GEMINI_API_KEY')
        
        config = LocalAgentConfig(
            response_schema=DJRecommendation,
            system_instruction=system_instruction,
            api_key=api_key
        )
        
        async with Agent(config) as agent:
            response = await agent.chat(agent_prompt)
            data = await response.structured_output()
            
            # Print the structured JSON to stdout so Node.js can parse it
            print(json.dumps(data))
            
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        asyncio.run(run_dj_agent(sys.argv[1]))
    else:
        print(json.dumps({"error": "No prompt data provided"}), file=sys.stderr)
        sys.exit(1)
