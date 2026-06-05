from typing import Dict, List
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Dict[eval_id, List[WebSocket]]
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, eval_id: int, websocket: WebSocket):
        await websocket.accept()
        if eval_id not in self.active_connections:
            self.active_connections[eval_id] = []
        self.active_connections[eval_id].append(websocket)

    def disconnect(self, eval_id: int, websocket: WebSocket):
        if eval_id in self.active_connections:
            self.active_connections[eval_id].remove(websocket)
            if not self.active_connections[eval_id]:
                del self.active_connections[eval_id]

    async def notify_signature(self, eval_id: int, message: dict):
        if eval_id in self.active_connections:
            for connection in self.active_connections[eval_id]:
                await connection.send_json(message)

manager = ConnectionManager()
