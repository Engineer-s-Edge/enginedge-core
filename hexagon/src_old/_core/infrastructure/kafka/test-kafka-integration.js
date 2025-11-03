/**
 * Test script for Kafka Calendar Event Streaming
 * This demonstrates the real-time event streaming capabilities
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000';
const TEST_USER_TOKEN = 'your_jwt_token_here'; // Replace with actual token

// Test data
const testEvents = [
  {
    eventType: 'event_created',
    eventData: {
      title: 'Morning Standup',
      startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endTime: new Date(Date.now() + 86400000 + 1800000).toISOString(), // +30 min
      duration: 30,
      category: 'work',
      priority: 'high',
      source: 'manual'
    },
    userContext: {
      timeOfDay: 9,
      dayOfWeek: 1,
      seasonality: 'morning',
      busySlots: 2,
      freeTime: 420
    },
    sessionData: {
      sessionId: 'test_session_001',
      actionSequence: 1,
      totalActionsInSession: 3,
      timeSpentOnPage: 120
    }
  },
  {
    eventType: 'event_updated',
    eventData: {
      title: 'Project Review Meeting',
      startTime: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      endTime: new Date(Date.now() + 172800000 + 3600000).toISOString(), // +1 hour
      duration: 60,
      category: 'work',
      priority: 'medium',
      source: 'manual'
    }
  },
  {
    eventType: 'event_viewed',
    eventData: {
      title: 'Calendar View',
      category: 'navigation',
      source: 'automatic'
    }
  }
];

/**
 * Test individual event tracking
 */
async function testSingleEventTracking() {
  console.log('🧪 Testing single event tracking...');
  
  try {
    for (const event of testEvents) {
      const response = await axios.post(`${BASE_URL}/api/calendar-ml/track-activity`, event, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_USER_TOKEN}`
        }
      });
      
      console.log(`✅ Event tracked: ${event.eventType}`);
      console.log(`   Kafka status: ${response.data.kafka?.published ? 'Published' : 'Not published'}`);
      console.log(`   Timestamp: ${response.data.timestamp}`);
      
      // Small delay between events
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('❌ Single event tracking failed:', error.response?.data || error.message);
  }
}

/**
 * Test batch event tracking
 */
async function testBatchEventTracking() {
  console.log('\n🧪 Testing batch event tracking...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/calendar-ml/batch-track-activity`, {
      activities: testEvents
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER_TOKEN}`
      }
    });
    
    console.log(`✅ Batch tracking completed: ${response.data.count} events`);
    console.log(`   Timestamp: ${response.data.timestamp}`);
  } catch (error) {
    console.error('❌ Batch event tracking failed:', error.response?.data || error.message);
  }
}

/**
 * Test ML pipeline trigger
 */
async function testMLTrigger() {
  console.log('\n🧪 Testing ML pipeline trigger...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/calendar-ml/trigger-ml-update`, {
      triggerType: 'retrain_model',
      reason: 'test_trigger'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER_TOKEN}`
      }
    });
    
    console.log(`✅ ML trigger sent: ${response.data.triggerType}`);
    console.log(`   Reason: ${response.data.reason}`);
    console.log(`   Triggered at: ${response.data.triggeredAt}`);
  } catch (error) {
    console.error('❌ ML trigger failed:', error.response?.data || error.message);
  }
}

/**
 * Test Kafka status
 */
async function testKafkaStatus() {
  console.log('\n🧪 Testing Kafka status...');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/calendar-ml/kafka-status`, {
      headers: {
        'Authorization': `Bearer ${TEST_USER_TOKEN}`
      }
    });
    
    console.log('✅ Kafka status retrieved:');
    console.log('   Connected:', response.data.kafka.details.kafka.connected);
    console.log('   Enabled:', response.data.kafka.details.kafka.enabled);
    console.log('   Topics:', response.data.kafka.details.kafka.topics.join(', '));
    console.log('   Healthy:', response.data.kafka.healthy);
  } catch (error) {
    console.error('❌ Kafka status check failed:', error.response?.data || error.message);
  }
}

/**
 * Generate sample prediction request
 */
async function testPrediction() {
  console.log('\n🧪 Testing ML prediction...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/calendar-ml/predict`, {
      eventData: {
        title: 'Test Prediction Meeting',
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 86400000 + 3600000).toISOString(),
        duration: 60,
        category: 'work',
        priority: 'medium'
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_USER_TOKEN}`
      }
    });
    
    console.log('✅ Prediction generated:');
    console.log(`   Success rate: ${(response.data.prediction.eventSuccess * 100).toFixed(1)}%`);
    console.log(`   Satisfaction: ${(response.data.prediction.userSatisfaction * 100).toFixed(1)}%`);
    console.log(`   Efficiency: ${(response.data.prediction.scheduleEfficiency * 100).toFixed(1)}%`);
    console.log(`   Recommendation: ${response.data.prediction.recommendation}`);
  } catch (error) {
    console.error('❌ Prediction test failed:', error.response?.data || error.message);
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🎯 Kafka Calendar Event Streaming Test Suite\n');
  console.log('=' .repeat(50));
  
  // Check if token is provided
  if (TEST_USER_TOKEN === 'your_jwt_token_here') {
    console.log('⚠️  Please update TEST_USER_TOKEN with a valid JWT token');
    console.log('   You can get a token by logging into the application');
    return;
  }
  
  await testKafkaStatus();
  await testSingleEventTracking();
  await testBatchEventTracking();
  await testMLTrigger();
  await testPrediction();
  
  console.log('\n' + '=' .repeat(50));
  console.log('🎉 Test suite completed!');
  console.log('\n💡 Check Kafka UI at http://localhost:8080 to see the events');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  runTests,
  testSingleEventTracking,
  testBatchEventTracking,
  testMLTrigger,
  testKafkaStatus,
  testPrediction
};
