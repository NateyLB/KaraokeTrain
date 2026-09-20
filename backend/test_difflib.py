import difflib

lrclib = "I got my peaches out in Georgia".split()
whisper = "I got my peaches, out in Georgia.".split()

print("Ratio:", difflib.SequenceMatcher(None, lrclib, whisper).ratio())
