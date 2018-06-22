import os
import time
import hmac
import hashlib
import base64

#=============================================================================
class WebRTCTurnCredentials():
    @staticmethod
    def get_credentials(reqid, time_limit):
        turn_username = reqid.encode()
        turn_secret = os.environ.get("WEBRTC_TURN_SECRET").encode()
        now = "{}".format(int(time.time() + time_limit)).encode()

        username = b':'.join([now, turn_username])
        password = base64.b64encode(hmac.new(turn_secret, username, digestmod=hashlib.sha1).digest())

        return {"username": username.decode("utf8"), "password": password.decode("utf8")}