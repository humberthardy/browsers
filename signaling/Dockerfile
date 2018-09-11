FROM python:3.5

RUN pip3 install --user websockets

COPY simple-server.py /simple-server.py

CMD ["python3", "-u", "/simple-server.py"]