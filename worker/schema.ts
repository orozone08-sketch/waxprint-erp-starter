// Generated from the preserved legacy models.
export const schema = {
  "app_users": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "username": {
      "type": "string",
      "nullable": false
    },
    "display_name": {
      "type": "string",
      "nullable": false
    },
    "role": {
      "type": "string",
      "nullable": false
    },
    "password_hash": {
      "type": "string",
      "nullable": false
    },
    "active": {
      "type": "boolean",
      "nullable": false
    },
    "created_at": {
      "type": "string",
      "nullable": false
    },
    "company_id": {
      "type": "number",
      "nullable": true
    },
    "session_version": {
      "type": "number",
      "nullable": false
    }
  },
  "customers": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "code": {
      "type": "string",
      "nullable": false
    },
    "name": {
      "type": "string",
      "nullable": false
    },
    "email": {
      "type": "string",
      "nullable": true
    },
    "whatsapp": {
      "type": "string",
      "nullable": true
    },
    "gst_number": {
      "type": "string",
      "nullable": true
    },
    "default_rate": {
      "type": "number",
      "nullable": false
    },
    "credit_days": {
      "type": "number",
      "nullable": false
    },
    "active": {
      "type": "boolean",
      "nullable": false
    },
    "created_at": {
      "type": "string",
      "nullable": false
    }
  },
  "suppliers": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "code": {
      "type": "string",
      "nullable": false
    },
    "name": {
      "type": "string",
      "nullable": false
    },
    "gst_number": {
      "type": "string",
      "nullable": true
    },
    "contact": {
      "type": "string",
      "nullable": true
    }
  },
  "employees": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "code": {
      "type": "string",
      "nullable": false
    },
    "name": {
      "type": "string",
      "nullable": false
    },
    "department": {
      "type": "string",
      "nullable": false
    },
    "role": {
      "type": "string",
      "nullable": false
    },
    "monthly_salary": {
      "type": "number",
      "nullable": false
    },
    "active": {
      "type": "boolean",
      "nullable": false
    }
  },
  "machines": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "code": {
      "type": "string",
      "nullable": false
    },
    "name": {
      "type": "string",
      "nullable": false
    },
    "model": {
      "type": "string",
      "nullable": true
    },
    "serial_number": {
      "type": "string",
      "nullable": true
    },
    "status": {
      "type": "string",
      "nullable": false
    }
  },
  "inbox_messages": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "source": {
      "type": "string",
      "nullable": false
    },
    "external_message_id": {
      "type": "string",
      "nullable": true
    },
    "sender": {
      "type": "string",
      "nullable": true
    },
    "subject": {
      "type": "string",
      "nullable": true
    },
    "body": {
      "type": "string",
      "nullable": true
    },
    "received_at": {
      "type": "string",
      "nullable": false
    },
    "archived": {
      "type": "boolean",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "customer_id": {
      "type": "number",
      "nullable": true
    },
    "job_id": {
      "type": "number",
      "nullable": true
    }
  },
  "jobs": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "number": {
      "type": "string",
      "nullable": false
    },
    "customer_id": {
      "type": "number",
      "nullable": false
    },
    "source": {
      "type": "string",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "priority": {
      "type": "string",
      "nullable": false
    },
    "instructions": {
      "type": "string",
      "nullable": true
    },
    "received_at": {
      "type": "string",
      "nullable": false
    },
    "completed_at": {
      "type": "string",
      "nullable": true
    },
    "billable_weight_g": {
      "type": "number",
      "nullable": false
    },
    "reshoot_weight_g": {
      "type": "number",
      "nullable": false
    },
    "weight_recorded_at": {
      "type": "string",
      "nullable": true
    }
  },
  "job_files": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": false
    },
    "file_uid": {
      "type": "string",
      "nullable": false
    },
    "original_name": {
      "type": "string",
      "nullable": false
    },
    "original_path": {
      "type": "string",
      "nullable": false
    },
    "processed_path": {
      "type": "string",
      "nullable": true
    },
    "sha256": {
      "type": "string",
      "nullable": true
    },
    "quantity": {
      "type": "number",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "received_at": {
      "type": "string",
      "nullable": false
    }
  },
  "magics_sessions": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": false
    },
    "operator_name": {
      "type": "string",
      "nullable": false
    },
    "workstation": {
      "type": "string",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "started_at": {
      "type": "string",
      "nullable": false
    },
    "completed_at": {
      "type": "string",
      "nullable": true
    },
    "checker_name": {
      "type": "string",
      "nullable": true
    },
    "approved": {
      "type": "boolean",
      "nullable": false
    }
  },
  "platforms": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "number": {
      "type": "string",
      "nullable": false
    },
    "software_name": {
      "type": "string",
      "nullable": false
    },
    "machine_id": {
      "type": "number",
      "nullable": true
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "is_reshoot_platform": {
      "type": "boolean",
      "nullable": false
    },
    "created_at": {
      "type": "string",
      "nullable": false
    }
  },
  "platform_files": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "platform_id": {
      "type": "number",
      "nullable": false
    },
    "job_file_id": {
      "type": "number",
      "nullable": false
    },
    "quantity": {
      "type": "number",
      "nullable": false
    }
  },
  "print_attempts": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "job_file_id": {
      "type": "number",
      "nullable": false
    },
    "platform_id": {
      "type": "number",
      "nullable": false
    },
    "machine_id": {
      "type": "number",
      "nullable": true
    },
    "attempt_no": {
      "type": "number",
      "nullable": false
    },
    "is_reshoot": {
      "type": "boolean",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "started_at": {
      "type": "string",
      "nullable": false
    },
    "completed_at": {
      "type": "string",
      "nullable": true
    },
    "expected_qty": {
      "type": "number",
      "nullable": false
    },
    "good_qty": {
      "type": "number",
      "nullable": false
    },
    "bad_qty": {
      "type": "number",
      "nullable": false
    },
    "qc_reason": {
      "type": "string",
      "nullable": true
    },
    "production_weight_g": {
      "type": "number",
      "nullable": false
    },
    "estimated_cost": {
      "type": "number",
      "nullable": false
    }
  },
  "reshoot_tickets": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "number": {
      "type": "string",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": false
    },
    "job_file_id": {
      "type": "number",
      "nullable": false
    },
    "original_attempt_id": {
      "type": "number",
      "nullable": true
    },
    "source": {
      "type": "string",
      "nullable": false
    },
    "reason": {
      "type": "string",
      "nullable": false
    },
    "quantity": {
      "type": "number",
      "nullable": false
    },
    "responsibility": {
      "type": "string",
      "nullable": false
    },
    "chargeable": {
      "type": "boolean",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "created_at": {
      "type": "string",
      "nullable": false
    },
    "closed_at": {
      "type": "string",
      "nullable": true
    }
  },
  "dispatches": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "number": {
      "type": "string",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": false
    },
    "courier": {
      "type": "string",
      "nullable": true
    },
    "tracking_no": {
      "type": "string",
      "nullable": true
    },
    "packed_by": {
      "type": "string",
      "nullable": true
    },
    "checked_by": {
      "type": "string",
      "nullable": true
    },
    "delivered_by": {
      "type": "string",
      "nullable": true
    },
    "packing_photo_path": {
      "type": "string",
      "nullable": true
    },
    "packing_photo_name": {
      "type": "string",
      "nullable": true
    },
    "dispatched_at": {
      "type": "string",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    }
  },
  "customer_returns": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "number": {
      "type": "string",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": false
    },
    "job_file_id": {
      "type": "number",
      "nullable": false
    },
    "dispatch_id": {
      "type": "number",
      "nullable": true
    },
    "complaint": {
      "type": "string",
      "nullable": false
    },
    "quantity": {
      "type": "number",
      "nullable": false
    },
    "responsibility": {
      "type": "string",
      "nullable": false
    },
    "chargeable": {
      "type": "boolean",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "created_at": {
      "type": "string",
      "nullable": false
    }
  },
  "materials": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "code": {
      "type": "string",
      "nullable": false
    },
    "name": {
      "type": "string",
      "nullable": false
    },
    "unit": {
      "type": "string",
      "nullable": false
    },
    "minimum_stock": {
      "type": "number",
      "nullable": false
    }
  },
  "purchases": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "supplier_id": {
      "type": "number",
      "nullable": false
    },
    "material_id": {
      "type": "number",
      "nullable": false
    },
    "purchase_date": {
      "type": "string",
      "nullable": false
    },
    "quantity": {
      "type": "number",
      "nullable": false
    },
    "rate": {
      "type": "number",
      "nullable": false
    },
    "tax_amount": {
      "type": "number",
      "nullable": false
    },
    "paid_amount": {
      "type": "number",
      "nullable": false
    },
    "invoice_no": {
      "type": "string",
      "nullable": true
    }
  },
  "inventory_transactions": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "material_id": {
      "type": "number",
      "nullable": false
    },
    "txn_date": {
      "type": "string",
      "nullable": false
    },
    "txn_type": {
      "type": "string",
      "nullable": false
    },
    "quantity": {
      "type": "number",
      "nullable": false
    },
    "unit_cost": {
      "type": "number",
      "nullable": false
    },
    "value": {
      "type": "number",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": true
    },
    "platform_id": {
      "type": "number",
      "nullable": true
    },
    "machine_id": {
      "type": "number",
      "nullable": true
    },
    "notes": {
      "type": "string",
      "nullable": true
    }
  },
  "expenses": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "expense_date": {
      "type": "string",
      "nullable": false
    },
    "category": {
      "type": "string",
      "nullable": false
    },
    "subcategory": {
      "type": "string",
      "nullable": true
    },
    "description": {
      "type": "string",
      "nullable": false
    },
    "amount": {
      "type": "number",
      "nullable": false
    },
    "tax_amount": {
      "type": "number",
      "nullable": false
    },
    "is_direct_cost": {
      "type": "boolean",
      "nullable": false
    },
    "related_type": {
      "type": "string",
      "nullable": false
    },
    "related_id": {
      "type": "number",
      "nullable": true
    },
    "payment_mode": {
      "type": "string",
      "nullable": false
    },
    "approved": {
      "type": "boolean",
      "nullable": false
    }
  },
  "payroll": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "employee_id": {
      "type": "number",
      "nullable": false
    },
    "period": {
      "type": "string",
      "nullable": false
    },
    "basic": {
      "type": "number",
      "nullable": false
    },
    "bonus": {
      "type": "number",
      "nullable": false
    },
    "commission": {
      "type": "number",
      "nullable": false
    },
    "reimbursement": {
      "type": "number",
      "nullable": false
    },
    "advance_deduction": {
      "type": "number",
      "nullable": false
    },
    "other_deduction": {
      "type": "number",
      "nullable": false
    },
    "net_payable": {
      "type": "number",
      "nullable": false
    },
    "paid": {
      "type": "boolean",
      "nullable": false
    }
  },
  "employee_advances": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "employee_id": {
      "type": "number",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": true
    },
    "advance_date": {
      "type": "string",
      "nullable": false
    },
    "amount": {
      "type": "number",
      "nullable": false
    },
    "purpose": {
      "type": "string",
      "nullable": false
    },
    "period": {
      "type": "string",
      "nullable": true
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "notes": {
      "type": "string",
      "nullable": true
    },
    "created_at": {
      "type": "string",
      "nullable": false
    }
  },
  "travel_advances": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "employee_id": {
      "type": "number",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": true
    },
    "trip_date": {
      "type": "string",
      "nullable": false
    },
    "destination": {
      "type": "string",
      "nullable": false
    },
    "purpose": {
      "type": "string",
      "nullable": false
    },
    "advance_amount": {
      "type": "number",
      "nullable": false
    },
    "flight_amount": {
      "type": "number",
      "nullable": false
    },
    "hotel_amount": {
      "type": "number",
      "nullable": false
    },
    "taxi_amount": {
      "type": "number",
      "nullable": false
    },
    "porter_amount": {
      "type": "number",
      "nullable": false
    },
    "other_amount": {
      "type": "number",
      "nullable": false
    },
    "settled_amount": {
      "type": "number",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    },
    "notes": {
      "type": "string",
      "nullable": true
    },
    "created_at": {
      "type": "string",
      "nullable": false
    }
  },
  "invoices": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "number": {
      "type": "string",
      "nullable": false
    },
    "customer_id": {
      "type": "number",
      "nullable": false
    },
    "invoice_date": {
      "type": "string",
      "nullable": false
    },
    "subtotal": {
      "type": "number",
      "nullable": false
    },
    "tax_amount": {
      "type": "number",
      "nullable": false
    },
    "total_amount": {
      "type": "number",
      "nullable": false
    },
    "status": {
      "type": "string",
      "nullable": false
    }
  },
  "invoice_lines": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "invoice_id": {
      "type": "number",
      "nullable": false
    },
    "job_id": {
      "type": "number",
      "nullable": true
    },
    "description": {
      "type": "string",
      "nullable": false
    },
    "weight_g": {
      "type": "number",
      "nullable": false
    },
    "rate": {
      "type": "number",
      "nullable": false
    },
    "amount": {
      "type": "number",
      "nullable": false
    }
  },
  "payments": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "invoice_id": {
      "type": "number",
      "nullable": false
    },
    "payment_date": {
      "type": "string",
      "nullable": false
    },
    "amount": {
      "type": "number",
      "nullable": false
    },
    "payment_mode": {
      "type": "string",
      "nullable": false
    },
    "reference": {
      "type": "string",
      "nullable": true
    }
  },
  "audit_logs": {
    "id": {
      "type": "number",
      "nullable": false
    },
    "module": {
      "type": "string",
      "nullable": false
    },
    "record_id": {
      "type": "number",
      "nullable": true
    },
    "action": {
      "type": "string",
      "nullable": false
    },
    "details": {
      "type": "string",
      "nullable": true
    },
    "user_name": {
      "type": "string",
      "nullable": false
    },
    "created_at": {
      "type": "string",
      "nullable": false
    },
    "company_id": {
      "type": "number",
      "nullable": false
    },
    "actor_user_id": {
      "type": "number",
      "nullable": true
    }
  }
} as const;
