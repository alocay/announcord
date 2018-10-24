"use strict";

import Queue from './queue.js';
import Announcement from './announcement.js';

class Announcer {
    constructor(guild, style, ignoreEmpty) 
    {
        this.announceQueue = new Queue();
        this.announcing = false;
        this.guild = guild;
        this.style = style;
        this.ignoreEmpty = ignoreEmpty;
    }
    
    updateAnnouncementStyle(style) {
        if (!style) return;
        
        this.style = style.toLowerCase();
    }
    
    updateIgnoreEmpty(isEnabled) {
        if(isEnabled === null || isEnabled === undefined) return;
        
        this.ignoreEmpty = isEnabled;
    }
    
    handleVoiceUpdate(username, oldChannel, newChannel) {
        if (oldChannel && newChannel) {
            if(oldChannel.id !== newChannel.id) {
                if (this.shouldAnnounceTheJoin(newChannel.members.size)) {
                    this.queueAnnouncement(username, newChannel, true);
                }
                
                if (this.shouldAnnounceTheExit(oldChannel.members.size)) {
                    this.queueAnnouncement(username, oldChannel, false);
                }
            }
        } else if (oldChannel) {
            if (this.shouldAnnounceTheExit(oldChannel.members.size)) {
                this.queueAnnouncement(username, oldChannel, false);
            }
        } else if (newChannel) {
            if (this.shouldAnnounceTheJoin(newChannel.members.size)) {
                this.queueAnnouncement(username, newChannel, true);
            }
        }
    }
    
    queueAnnouncement(username, channel, entered) {
        if (channel.id === this.guild.afkChannelID) return;
        
        Announcement.CreateAnnouncement(username, channel, entered).then(this.onAnnouncementCreated.bind(this), err => { console.error(err); });
    }
    
    startAnnouncing() {
        if (!this.announcing) {
            this.annouceNextUser();
        }
    }
    
    annouceNextUser() {
        this.announcing = true;
        const announcement = this.announceQueue.dequeue();
        
        if (announcement) {
            this.announce(announcement);
        } else {
            this.announcing = false;
        }
    }
    
    announce(announcement) {
        if (announcement && announcement.channel && announcement.stream) {
            announcement.channel.join().then(this.onChannelJoined.bind(this, announcement));
        } else {
            console.log('something was null in the announcement - skipping', announcement);
            this.annouceNextUser();
        }
    }
    
    onChannelJoined(announcement, connection) {
        const dispatcher = connection.playStream(announcement.stream);
                                
                dispatcher.on('start', () => {
                    //connection.player.streamingData.pausedTime = 0;
                    //console.log('started!');
                });
                
                dispatcher.on('end', () => { 
                    //console.log('ended!');
                    announcement.stream.destroy(new Error('error destroying'));
                    announcement.channel.leave();
                    this.annouceNextUser();
                });
    }
    
    onAnnouncementCreated(ann) {
        this.announceQueue.enqueue(ann);
        this.startAnnouncing();
    }
    
    shouldAnnounceJoins() {
        return this.style === 'both' || this.style === 'join';
    }
    
    shouldAnnounceExits() {
        return this.style === 'both' || this.style === 'exit';
    }
    
    shouldAnnounceTheJoin(memberCount) {
        return this.shouldAnnounceJoins() && (!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 1));
    }
    
    shouldAnnounceTheExit(memberCount) {
        return this.shouldAnnounceExits() && (!this.ignoreEmpty || (this.ignoreEmpty && memberCount > 0));
    }
}

export default Announcer;