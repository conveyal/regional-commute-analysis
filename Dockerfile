FROM node

ADD . /code
WORKDIR /code

RUN sudo apt-get install -y make unzip wget
RUN npm install

CMD [ "make" ]